// Read queries against the Hypercerts API.
//
// Every page, route handler and embed reads through these functions; nothing
// else talks to the API. They call the XRPC endpoints with @atproto/lex and
// the query definitions from @hypercerts-org/api. When the Hypercerts SDK
// ships its read layer, only the bodies of these functions should change.
import "server-only";

import { Client, l } from "@atproto/lex";
import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { getDid, getHandle } from "@/lib/identity";
import { logError } from "@/lib/log";
import { isDid as isDidParam } from "@/lib/validate";
import { tags } from "./cache";
import {
  type ActivityCard,
  type ActorCard,
  type ActorDetail,
  activityRecord,
  awardSubject,
  didOf,
  type EndorsementCard,
  formatDate,
  type ListCard,
  type Page,
  type PersonRow,
  type ProfileVersion,
  type ProjectCard,
  type ProjectDetail,
  projectRecord,
  type RecentRecord,
  toActivityCard,
  toActorCard,
  toActorDetail,
  toEndorsementCard,
  toProfileVersion,
  toProjectCard,
  toProjectDetail,
} from "./views";

// Response validation is off for reads. Indexed records come from many authors,
// and some older ones do not match their lexicon (for example a description
// missing its $type). With validation on, one such record fails the whole
// response. Responses are still typed from the lexicons; the view mappers in
// ./views stay defensive only where the data is known to diverge. Writes
// should keep strict validation.
const api = new Client(process.env.HYPERCERTS_API_URL ?? "https://api.hypercerts.dev", {
  validateResponse: false,
});

const read = () => ({ signal: AbortSignal.timeout(8_000) });

/**
 * Whether a failed read means the record doesn't exist. Any other failure is
 * thrown, so an outage reaches an error boundary instead of being cached as a
 * 404. The API currently reports a missing record as an HTTP 500 script_error
 * naming RecordNotFound in its message (TECH-858); the check covers both forms.
 */
function notFound(failure: { error: string; message: string }): boolean {
  return (
    failure.error === "RecordNotFound" ||
    failure.message.includes("RecordNotFound:") ||
    // A handle that resolves to no account (same TECH-858 error shape).
    failure.message.includes("HandleResolutionFailed:")
  );
}

// Public, indexed data: shared by every visitor, refreshed within about a minute.
// Next.js uses the same profile for the prerendered page and its ISR upgrade.
function publicData(tag: string) {
  cacheLife("public");
  cacheTag(tag);
}

/**
 * The cards with their verified handles (each cached for hours), so profile
 * links go straight to the handle's address instead of through a redirect
 * from the DID. The API's views don't carry handles yet (TECH-896).
 */
async function withHandles<T extends ActorCard>(cards: T[]): Promise<T[]> {
  const dids = [...new Set(cards.map((card) => card.did))];
  const handles = new Map(
    await Promise.all(dids.map(async (did) => [did, await getHandle(did)] as const)),
  );
  return cards.map((card) => ({ ...card, handle: handles.get(card.did) ?? null }));
}

/** The same for the cards inside other views (an activity's author, an award's issuer). */
async function withHandlesIn<T, K extends keyof T>(items: T[], key: K): Promise<T[]> {
  const cards = await withHandles(items.map((item) => item[key] as ActorCard));
  return items.map((item, i) => ({ ...item, [key]: cards[i] }));
}

// Callers validate identifiers before they reach these functions (see
// src/lib/validate.ts); the casts only satisfy lex's branded string types.
type ActivityView = org.hypercerts.claim.getActivity.ActivityView;
type Did = l.DidString;
type AtUri = l.AtUriString;

export async function getActor(actor: string): Promise<ActorDetail | null> {
  "use cache";
  publicData(tags.actor(actor));
  // Anything else in the URL (a stray /favicon.png, a probe) is no account:
  // answered without an API call.
  if (!isDidParam(actor) && !l.isHandleString(actor)) return null;

  // getProfile accepts a handle or DID; getOrganization needs the DID and
  // fails for accounts without an organization record (people). An
  // organization can exist without a profile, so a DID gets the organization
  // lookup either way. Given a DID, all three lookups run at once; given a
  // handle, the profile names the DID first.
  const lookups = (did: Did) =>
    Promise.all([
      api.xrpcSafe(app.certified.actor.getOrganization, { params: { actor: did }, ...read() }),
      getHandle(did),
    ]);
  const isDid = actor.startsWith("did:");
  const byDid = isDid ? lookups(actor as Did) : null;
  const profile = await api.xrpcSafe(app.certified.actor.getProfile, {
    params: { actor: actor as l.AtIdentifierString },
    ...read(),
  });
  if (!profile.success && !notFound(profile)) throw profile;
  // An account without a profile still has a page (others follow and endorse
  // it), so a handle the API doesn't know is resolved on its own.
  const did = profile.success
    ? profile.body.profile.did
    : isDid
      ? (actor as Did)
      : ((await getDid(actor)) as Did | null);
  if (!did) return null;
  // Tagged by DID too, whatever the URL said: a profile save expires
  // tags.actor(did), and the page at /{handle} must go with it.
  if (actor !== did) cacheTag(tags.actor(did));
  const [organization, handle] = await (byDid ?? lookups(did));

  if (organization.success) {
    const detail = { ...toActorDetail(organization.body.actor), handle };
    // The view carries the organization's location record: no second call.
    const name = organization.body.actor.location?.record.name;
    return name ? { ...detail, place: placeName(name) } : detail;
  }
  if (!notFound(organization)) throw organization;
  if (profile.success) {
    return { ...toActorDetail({ did, profile: profile.body.profile, organization: null }), handle };
  }
  // No Certified records at all: the account by its handle (or DID), so
  // links from followers and endorsements don't lead to "not found".
  const bare = toActorDetail({ did, profile: null, organization: null });
  return { ...bare, handle, displayName: handle ? `@${handle}` : did };
}

/**
 * A location's name, cut to its last two parts ("Wilmington, New Castle
 * County, Delaware, United States" reads "Delaware, United States").
 */
function placeName(name: string): string {
  return name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(-2)
    .join(", ");
}

/**
 * The indexed version of an account's profile, read past every cache. The
 * write overlay compares its CID with what the user saved to tell whether the
 * index has caught up; a cached answer could confirm nothing.
 */
export async function getIndexedProfile(did: string): Promise<ProfileVersion | null> {
  const result = await api.xrpcSafe(app.certified.actor.getProfile, {
    params: { actor: did as Did },
    ...read(),
  });
  if (result.success) return toProfileVersion(result.body.profile);
  if (notFound(result)) return null;
  throw result;
}

export async function listActivitiesPage(options: {
  author: string;
  cursor?: string;
  limit: number;
}): Promise<Page<ActivityCard>> {
  "use cache";
  publicData(tags.activities(options.author));

  const { activities, cursor } = await api.call(
    org.hypercerts.claim.listActivities,
    { authors: [options.author as Did], cursor: options.cursor, limit: options.limit },
    read(),
  );
  return {
    items: await withHandlesIn(activities.map(toActivityCard), "author"),
    cursor: cursor ?? null,
  };
}

export async function listProjectsPage(options: {
  author: string;
  cursor?: string;
}): Promise<Page<ProjectCard>> {
  "use cache";
  publicData(tags.projects(options.author));

  const { collections, cursor } = await api.call(
    org.hypercerts.collection.listCollections,
    {
      authors: [options.author as Did],
      types: ["project"],
      cursor: options.cursor,
      limit: 10,
    },
    read(),
  );
  return { items: collections.map(toProjectCard), cursor: cursor ?? null };
}

export async function getProject(uri: string): Promise<ProjectDetail | null> {
  "use cache";
  publicData(tags.project(uri));

  const result = await api.xrpcSafe(org.hypercerts.collection.getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (result.success) {
    const [project] = await withHandlesIn([toProjectDetail(result.body.collection)], "author");
    return project;
  }
  if (notFound(result)) return null;
  throw result;
}

export async function listProjectActivitiesPage(options: {
  project: string;
  cursor?: string;
}): Promise<Page<ActivityCard>> {
  "use cache";
  publicData(tags.project(options.project));

  const { items, cursor } = await api.call(
    org.hypercerts.collection.listCollectionItems,
    {
      collection: options.project as AtUri,
      cursor: options.cursor,
      limit: 10,
    },
    read(),
  );
  // Collection items can reference activities, nested collections or other
  // records; the spike shows activities only.
  const activities = items
    .map((item) => item.record)
    .filter(
      (record): record is l.$Typed<ActivityView> =>
        record?.$type === "org.hypercerts.claim.getActivity#activityView",
    );
  return {
    items: await withHandlesIn(activities.map(toActivityCard), "author"),
    cursor: cursor ?? null,
  };
}

export async function listOrganizationsPage(options: {
  query?: string;
  cursor?: string;
}): Promise<Page<ActorCard>> {
  "use cache";
  publicData(tags.organizations());

  const params = { cursor: options.cursor, limit: 12 };
  const { actors, cursor } = options.query
    ? await api.call(
        app.certified.actor.searchOrganizations,
        { ...params, search: options.query },
        read(),
      )
    : await api.call(app.certified.actor.listOrganizations, params, read());
  return { items: await withHandles(actors.map(toActorCard)), cursor: cursor ?? null };
}

/** The badge type of endorsements, which pages show apart from other badges. */
function chunks<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Cards for these accounts, in their order (an account the API doesn't know
 * is left out): batched, one call per hundred, never one per account.
 */
export async function getActorCards(dids: string[]): Promise<ActorCard[]> {
  "use cache";
  cacheLife("public");
  for (const did of dids) cacheTag(tags.actor(did));
  const cards = await actorCards(dids);
  return dids.flatMap((did) => cards.get(did) ?? []);
}

// Organizations come with their profile; accounts without an organization
// record (people) need a second lookup for theirs.
async function actorCards(dids: string[]): Promise<Map<string, ActorCard>> {
  const cards = new Map<string, ActorCard>();
  for (const batch of chunks(dids)) {
    const { organizations } = await api.call(
      app.certified.actor.getOrganizations,
      { actors: batch as Did[] },
      read(),
    );
    for (const result of organizations)
      if (result.organization) cards.set(result.actor, toActorCard(result.organization));
    const people = batch.filter((did) => !cards.has(did));
    if (people.length === 0) continue;
    const { profiles } = await api.call(
      app.certified.actor.getProfiles,
      { actors: people as Did[] },
      read(),
    );
    for (const result of profiles)
      cards.set(
        result.actor,
        toActorCard({
          did: result.actor,
          profile: result.profile,
          organization: null,
        }),
      );
  }
  const named = await withHandles([...cards.values()]);
  return new Map(named.map((card) => [card.did, card]));
}

// Workspace overview
//
// The overview's counts and latest rows, all public, indexed data. Badge
// awards and follows come with a total from the API; activities and
// collections don't, so their counts page through the records, up to
// MAX_COUNTED, and say "1,000+" beyond it.

const MAX_COUNTED = 1_000;

/** A count of records; `capped` when there are more than were counted. */
export type Count = { value: number; capped: boolean };

async function countPages(
  page: (cursor: string | undefined) => Promise<{ count: number; cursor?: string }>,
): Promise<Count> {
  let value = 0;
  let cursor: string | undefined;
  do {
    const result = await page(cursor);
    value += result.count;
    cursor = result.cursor;
  } while (cursor && value < MAX_COUNTED);
  return { value, capped: Boolean(cursor) };
}

/**
 * Collection types the staging app writes for lists of endorsements,
 * activities, projects and accounts. They are that app's convention, not
 * lexicon values.
 */
const LIST_TYPES = ["list:endorsements", "list:certs", "list:projects", "list:accounts"];

export type RecordCounts = { activities: Count; projects: Count; lists: Count };

export async function getRecordCounts(did: string): Promise<RecordCounts> {
  "use cache";
  publicData(tags.activities(did));
  cacheTag(tags.projects(did));

  const collections = (types: string[]) =>
    countPages(async (cursor) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { authors: [did as Did], types, limit: 100, cursor },
        read(),
      );
      return { count: page.collections.length, cursor: page.cursor };
    });
  const [activities, projects, lists] = await Promise.all([
    countPages(async (cursor) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { authors: [did as Did], limit: 100, cursor },
        read(),
      );
      return { count: page.activities.length, cursor: page.cursor };
    }),
    collections(["project"]),
    collections(LIST_TYPES),
  ]);
  return { activities, projects, lists };
}

/** The account's newest activities and projects together, newest first. */
export async function listLatestRecords(did: string, limit: number): Promise<RecentRecord[]> {
  "use cache";
  publicData(tags.activities(did));
  cacheTag(tags.projects(did));

  const [{ activities }, { collections }] = await Promise.all([
    api.call(org.hypercerts.claim.listActivities, { authors: [did as Did], limit }, read()),
    api.call(
      org.hypercerts.collection.listCollections,
      { authors: [did as Did], types: ["project"], limit },
      read(),
    ),
  ]);
  return [...activities.map(activityRecord), ...collections.map(projectRecord)]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);
}

/** The network's size, for the landing page: each kind counted up to MAX_COUNTED. */
export type NetworkCounts = {
  people: Count | null;
  organizations: Count | null;
  projects: Count | null;
  activities: Count | null;
  endorsements: Count | null;
};

/** A count, or null when it can't be had: one bad record fails a page's validation. */
const orNull = (count: Promise<Count>) =>
  count.catch((err: unknown) => {
    logError("[network counts] count failed", err);
    return null;
  });

/**
 * The network's size, by paging the API (it has no count endpoint yet),
 * each kind capped at MAX_COUNTED. Cached for hours: the landing page shows
 * it to everyone.
 */
export async function getNetworkCounts(): Promise<NetworkCounts> {
  "use cache";
  cacheLife("hours");

  const page = { limit: 100 };
  const [people, organizations, projects, activities, endorsements] = await Promise.all([
    orNull(
      countPages(async (cursor) => {
        const r = await api.call(app.certified.actor.listProfiles, { ...page, cursor }, read());
        return { count: r.profiles.length, cursor: r.cursor };
      }),
    ),
    orNull(
      countPages(async (cursor) => {
        const r = await api.call(
          app.certified.actor.listOrganizations,
          { ...page, cursor },
          read(),
        );
        return { count: r.actors.length, cursor: r.cursor };
      }),
    ),
    orNull(
      countPages(async (cursor) => {
        const r = await api.call(
          org.hypercerts.collection.listCollections,
          { ...page, types: ["project"], cursor },
          read(),
        );
        return { count: r.collections.length, cursor: r.cursor };
      }),
    ),
    orNull(
      countPages(async (cursor) => {
        const r = await api.call(org.hypercerts.claim.listActivities, { ...page, cursor }, read());
        return { count: r.activities.length, cursor: r.cursor };
      }),
    ),
    orNull(
      countPages(async (cursor) => {
        const r = await api.call(
          app.certified.badge.listBadgeAwards,
          { ...page, badgeTypes: ["endorsement"], cursor },
          read(),
        );
        return { count: r.badgeAwards.length, cursor: r.cursor };
      }),
    ),
  ]);
  return { people, organizations, projects, activities, endorsements };
}

/** What a workspace's Projects and activities lists. */
export type Work = {
  projects: ProjectCard[];
  /** The account's own activities, newest first. */
  activities: ActivityCard[];
  /** Other accounts' activities that sit in its projects. */
  others: ActivityCard[];
  /** Whether there were more activities or projects than were loaded. */
  truncated: boolean;
};

const MAX_WORK = 500;

/**
 * An account's projects and activities, for its workspace: every activity
 * it published, every project, and the activities other accounts published
 * that its projects hold.
 */
export async function getWork(did: string): Promise<Work> {
  "use cache";
  publicData(tags.activities(did));
  cacheTag(tags.projects(did));

  async function all<T>(
    load: (cursor?: string) => Promise<{ items: T[]; cursor?: string }>,
  ): Promise<{ items: T[]; more: boolean }> {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await load(cursor);
      items.push(...page.items);
      cursor = page.cursor;
    } while (cursor && items.length < MAX_WORK);
    return { items, more: Boolean(cursor) };
  }

  const [activities, projects] = await Promise.all([
    all(async (cursor) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { authors: [did as Did], limit: 100, cursor },
        read(),
      );
      return { items: page.activities.map(toActivityCard), cursor: page.cursor };
    }),
    all(async (cursor) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { authors: [did as Did], types: ["project"], limit: 100, cursor },
        read(),
      );
      return { items: page.collections.map(toProjectCard), cursor: page.cursor };
    }),
  ]);

  const own = new Set(activities.items.map((activity) => activity.uri));
  const foreign = [...new Set(projects.items.flatMap((project) => project.activityUris))].filter(
    (uri) => !own.has(uri) && didOf(uri) !== did,
  );
  const others: ActivityCard[] = [];
  for (const batch of chunks(foreign)) {
    const page = await api.call(
      org.hypercerts.claim.listActivities,
      { uris: batch as AtUri[], limit: 100 },
      read(),
    );
    others.push(...page.activities.map(toActivityCard));
  }

  return {
    projects: projects.items,
    activities: activities.items,
    others: await withHandlesIn(others, "author"),
    truncated: activities.more || projects.more,
  };
}

export type Endorsements = {
  /** Received, leaving out those the account rejected. */
  receivedCount: number;
  /** Received and hidden by the account (rejected). */
  hiddenCount: number;
  given: number;
  latestReceived: EndorsementCard[];
};

/**
 * Badge awards whose definition has badgeType "endorsement": counted as award
 * records (two awards to one account count as two).
 */
export async function getEndorsements(did: string, latest: number): Promise<Endorsements> {
  "use cache";
  publicData(tags.endorsements(did));

  const badgeTypes = ["endorsement"];
  const [received, hidden, given] = await Promise.all([
    api.call(
      app.certified.badge.listBadgeAwards,
      {
        subjects: [did],
        badgeTypes,
        responses: ["accepted", "unanswered"],
        includeTotal: true,
        limit: latest,
      },
      read(),
    ),
    api.call(
      app.certified.badge.listBadgeAwards,
      { subjects: [did], badgeTypes, responses: ["rejected"], includeTotal: true, limit: 1 },
      read(),
    ),
    api.call(
      app.certified.badge.listBadgeAwards,
      { authors: [did as Did], badgeTypes, includeTotal: true, limit: 1 },
      read(),
    ),
  ]);
  return {
    receivedCount: received.totalCount ?? received.badgeAwards.length,
    hiddenCount: hidden.totalCount ?? hidden.badgeAwards.length,
    given: given.totalCount ?? given.badgeAwards.length,
    latestReceived: await withHandlesIn(received.badgeAwards.map(toEndorsementCard), "issuer"),
  };
}

/** Whether `actor` follows `subject`: one lookup, not a page of follows. */
export async function isFollowing(actor: string, subject: string): Promise<boolean> {
  "use cache";
  publicData(tags.follows(actor));
  const { follow } = await api.call(
    app.certified.graph.getFollow,
    { actor: actor as Did, subject: subject as Did },
    read(),
  );
  return Boolean(follow);
}

export type FollowCounts = { followers: number; following: number };

export async function getFollowCounts(did: string): Promise<FollowCounts> {
  "use cache";
  publicData(tags.follows(did));

  const [followers, following] = await Promise.all([
    api.call(app.certified.graph.listActorFollowers, { actor: did as Did, limit: 1 }, read()),
    api.call(app.certified.graph.listActorFollowing, { actor: did as Did, limit: 1 }, read()),
  ]);
  return { followers: followers.totalCount, following: following.totalCount };
}

// Profile tabs: endorsements, followers and lists
//
// One page each (up to PEOPLE_PAGE rows); the pages say when there are more.

const PEOPLE_PAGE = 100;

export type PeoplePage = { rows: PersonRow[]; more: boolean };

/** Endorsements received (leaving out rejected ones) or given, newest first. */
/**
 * Endorsements `did` received or gave, newest first. Received ones its
 * subject hid from its profile are left out, unless `withHidden` (the
 * workspace, where they can be shown again), which marks them `hidden`.
 */
export async function listEndorsements(
  did: string,
  direction: "received" | "given",
  withHidden = false,
): Promise<PeoplePage> {
  "use cache";
  publicData(tags.endorsements(did));

  const { badgeAwards, cursor } = await api.call(
    app.certified.badge.listBadgeAwards,
    direction === "received"
      ? {
          subjects: [did],
          badgeTypes: ["endorsement"],
          responses: withHidden
            ? ["accepted", "unanswered", "rejected"]
            : ["accepted", "unanswered"],
          limit: PEOPLE_PAGE,
        }
      : { authors: [did as Did], badgeTypes: ["endorsement"], limit: PEOPLE_PAGE },
    read(),
  );
  const subjects =
    direction === "given"
      ? await actorCards([
          ...new Set(
            badgeAwards
              .map((award) => awardSubject(award.record.subject))
              .filter((subject): subject is string => Boolean(subject?.startsWith("did:"))),
          ),
        ])
      : null;
  const rows: PersonRow[] = [];
  for (const award of badgeAwards) {
    const card = toEndorsementCard(award);
    const subject = awardSubject(award.record.subject);
    const actor = subjects ? (subject ? subjects.get(subject) : undefined) : card.issuer;
    if (!actor) continue;
    rows.push({
      uri: award.uri,
      actor,
      note: card.note,
      date: card.createdAt,
      hidden: award.responseStatus === "rejected",
    });
  }
  return { rows: await withHandlesIn(rows, "actor"), more: Boolean(cursor) };
}

/**
 * The distinct accounts that endorsed `did`, most recent first, from its
 * latest endorsements: for the header's "Endorsed by" line.
 */
export async function getEndorsers(
  did: string,
): Promise<{ endorsers: ActorCard[]; more: boolean }> {
  "use cache";
  publicData(tags.endorsements(did));

  const { rows, more } = await listEndorsements(did, "received");
  const seen = new Set<string>();
  const endorsers = rows
    .map((row) => row.actor)
    .filter((actor) => !seen.has(actor.did) && seen.add(actor.did));
  return { endorsers, more };
}

/** Who follows `did` ("followers") or whom it follows ("following"), newest first. */
export async function listFollows(
  did: string,
  direction: "followers" | "following",
): Promise<PeoplePage> {
  "use cache";
  publicData(tags.follows(did));

  const params = { actor: did as Did, limit: PEOPLE_PAGE };
  const { views, cursor } =
    direction === "followers"
      ? await api
          .call(app.certified.graph.listActorFollowers, params, read())
          .then((out) => ({ views: out.followers, cursor: out.cursor }))
      : await api
          .call(app.certified.graph.listActorFollowing, params, read())
          .then((out) => ({ views: out.following, cursor: out.cursor }));
  const rows = views.map((view) => ({
    uri: view.follow.uri,
    actor: toActorCard({ did: view.did, profile: view.profile, organization: view.organization }),
    note: null,
    date: formatDate(view.follow.record.createdAt),
  }));
  return { rows: await withHandlesIn(rows, "actor"), more: Boolean(cursor) };
}

const LIST_KIND: Record<string, string> = {
  "list:accounts": "Accounts",
  "list:certs": "Activities",
  "list:projects": "Projects",
  "list:endorsements": "Endorsements",
};

export async function listLists(did: string): Promise<{ lists: ListCard[]; more: boolean }> {
  "use cache";
  publicData(tags.projects(did));

  const { collections, cursor } = await api.call(
    org.hypercerts.collection.listCollections,
    { authors: [did as Did], types: LIST_TYPES, limit: PEOPLE_PAGE },
    read(),
  );
  return {
    lists: collections.map((collection) => ({
      uri: collection.uri,
      title: collection.record.title || "Untitled list",
      kind: LIST_KIND[collection.record.type ?? ""] ?? "List",
      itemCount: collection.record.items?.length ?? 0,
      summary: collection.record.shortDescription || null,
    })),
    more: Boolean(cursor),
  };
}
