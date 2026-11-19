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
import { getBlobText } from "@/lib/blobs";
import { getPlaceLabel } from "@/lib/geocode";
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
  type BadgeCard,
  type BadgeDetail,
  didOf,
  type EndorsementCard,
  type ExploreAccount,
  type ExploreActivity,
  type ExploreProject,
  type FeedEvent,
  type FeedRow,
  formatDate,
  formatMoney,
  type ListCard,
  type ListItem,
  locationBlobCid,
  type Page,
  type PersonRow,
  type ProfileVersion,
  type ProjectCard,
  type ProjectDetail,
  plainText,
  projectRecord,
  type Receipt,
  type RecentRecord,
  sortBadges,
  toActivityCard,
  toActorCard,
  toActorDetail,
  toAge,
  toBadgeCard,
  toBadgeDetail,
  toEndorsementCard,
  toExploreActivity,
  toExploreProject,
  toPlace,
  toProfileVersion,
  toProjectCard,
  toProjectDetail,
  toReceipt,
  totalsByCurrency,
} from "./views";

// Response validation is off for reads. Indexed records come from many authors,
// and some older ones do not match their lexicon (for example a description
// missing its $type). With validation on, one such record fails the whole
// response. Responses are still typed from the lexicons; the view mappers in
// ./views stay defensive only where the data is known to diverge. Writes
// should keep strict validation.
type BadgeAwardView = app.certified.badge.getBadgeAward.BadgeAwardView;

const api = new Client(process.env.HYPERCERTS_API_URL ?? "https://api.hypercerts.dev", {
  validateResponse: false,
  // Nor reject a whole response over one record's malformed blob reference
  // (a banner whose $link is "[object Object]" failed every page holding it).
  strictResponseProcessing: false,
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
    const record = organization.body.actor.location?.record;
    if (!record) return detail;
    // Some records keep their coordinates in a blob on the account's server.
    const cid = locationBlobCid(record);
    const place = toPlace(record, cid ? await getBlobText(did, cid) : null);
    // The short name from the point ("Corvallis, United States"), as the
    // record's own name is free text; without one, its last two parts.
    const label = place?.point ? await getPlaceLabel(place.point) : null;
    return { ...detail, place: place && label ? { ...place, short: label } : place };
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

type NetworkKind = keyof NetworkCounts;

/**
 * One kind's size across the network: cached for hours, or null cached for
 * minutes when it can't be had (one bad record fails a whole page's
 * validation), so a failure is asked again soon and never fails the page.
 * The API has no count endpoint except badge awards' includeTotal, so the
 * other kinds page through, capped at MAX_COUNTED.
 */
async function countNetwork(kind: NetworkKind): Promise<Count | null> {
  "use cache";
  try {
    const count = await fetchNetworkCount(kind);
    cacheLife("hours");
    return count;
  } catch (err) {
    logError("[network counts] count failed", err, { kind });
    cacheLife("minutes");
    return null;
  }
}

async function fetchNetworkCount(kind: NetworkKind): Promise<Count> {
  const page = { limit: 100 };
  switch (kind) {
    case "people":
      return countPages(async (cursor) => {
        const r = await api.call(app.certified.actor.listProfiles, { ...page, cursor }, read());
        return { count: r.profiles.length, cursor: r.cursor };
      });
    case "organizations":
      return countPages(async (cursor) => {
        const r = await api.call(
          app.certified.actor.listOrganizations,
          { ...page, cursor },
          read(),
        );
        return { count: r.actors.length, cursor: r.cursor };
      });
    case "projects":
      return countPages(async (cursor) => {
        const r = await api.call(
          org.hypercerts.collection.listCollections,
          { ...page, types: ["project"], cursor },
          read(),
        );
        return { count: r.collections.length, cursor: r.cursor };
      });
    case "activities":
      return countPages(async (cursor) => {
        const r = await api.call(org.hypercerts.claim.listActivities, { ...page, cursor }, read());
        return { count: r.activities.length, cursor: r.cursor };
      });
    case "endorsements": {
      const r = await api.call(
        app.certified.badge.listBadgeAwards,
        { badgeTypes: ["endorsement"], includeTotal: true, limit: 1 },
        read(),
      );
      return { value: r.totalCount ?? r.badgeAwards.length, capped: false };
    }
  }
}

const NETWORK_KINDS: NetworkKind[] = [
  "people",
  "organizations",
  "projects",
  "activities",
  "endorsements",
];

/** The network's size for the landing page, each kind cached on its own. */
export async function getNetworkCounts(): Promise<NetworkCounts> {
  const counts = await Promise.all(NETWORK_KINDS.map(countNetwork));
  return Object.fromEntries(NETWORK_KINDS.map((kind, i) => [kind, counts[i]])) as NetworkCounts;
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
/**
 * How many of the latest received endorsements every caller asks for: one
 * value, so the profile, its tabs and the workspace share one cached answer.
 */
const LATEST_ENDORSEMENTS = 3;

export async function getEndorsements(did: string): Promise<Endorsements> {
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
        limit: LATEST_ENDORSEMENTS,
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

/**
 * Who follows a project (an entity follow, app.certified.graph.entityFollow),
 * newest first (one page), and how many do in all.
 */
export async function getProjectFollowers(uri: string): Promise<PeoplePage & { total: number }> {
  "use cache";
  publicData(tags.project(uri));

  const { followers, totalCount, cursor } = await api.call(
    app.certified.graph.listEntityFollowers,
    { entity: uri as AtUri, limit: PEOPLE_PAGE },
    read(),
  );
  const rows = followers.map((view) => ({
    uri: view.follow.uri,
    actor: toActorCard({ did: view.did, profile: view.profile, organization: view.organization }),
    note: null,
    date: formatDate(view.follow.record.createdAt),
  }));
  return { rows: await withHandlesIn(rows, "actor"), more: Boolean(cursor), total: totalCount };
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
      badge: card.badge,
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

// Badges
//
// Every badge awarded to an account, apart from the ones a profile shows as
// endorsements (views.ts, toBadgeCard): accepted by the recipient, or still
// awaiting its response. Rejected ones never show.

/** Pages of awards read per response, a hundred each. */
const BADGE_PAGES = 3;

export type Badges = {
  accepted: BadgeCard[];
  awaiting: BadgeCard[];
  /** Whether either list stopped at BADGE_PAGES with more to read. */
  more: boolean;
};

async function badgeAwards(did: string, response: "accepted" | "unanswered" | "rejected") {
  const awards: BadgeAwardView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < BADGE_PAGES; page++) {
    const out = await api.call(
      app.certified.badge.listBadgeAwards,
      { subjects: [did], responses: [response], limit: 100, cursor },
      read(),
    );
    awards.push(...out.badgeAwards);
    cursor = out.cursor;
    if (!cursor) return { awards, more: false };
  }
  return { awards, more: true };
}

/** The badges awarded to `did`, each list in force first, then newest; expired last. */
export async function getBadges(did: string): Promise<Badges> {
  "use cache";
  publicData(tags.badges(did));

  const [accepted, awaiting] = await Promise.all([
    badgeAwards(did, "accepted"),
    badgeAwards(did, "unanswered"),
  ]);
  const cards = async (awards: BadgeAwardView[]) =>
    sortBadges(
      await withHandlesIn(
        awards.flatMap((award) => toBadgeCard(award) ?? []),
        "issuer",
      ),
    );
  return {
    accepted: await cards(accepted.awards),
    awaiting: await cards(awaiting.awards),
    more: accepted.more || awaiting.more,
  };
}

/**
 * The badges `did` rejected: for its workspace only, where they can be
 * accepted again. A profile never shows them.
 */
export async function getRejectedBadges(did: string): Promise<BadgeCard[]> {
  "use cache";
  publicData(tags.badges(did));

  const { awards } = await badgeAwards(did, "rejected");
  return sortBadges(
    await withHandlesIn(
      awards.flatMap((award) => toBadgeCard(award, Date.now(), { withRejected: true }) ?? []),
      "issuer",
    ),
  );
}

/** A badge an account defined, with how many hold it. */
export type IssuedBadge = BadgeDetail & {
  /** Awards accepted or awaiting a response (not rejected). */
  holders: number;
};

/** How many issued badges a profile reads (one page of definitions). */
const ISSUED_PAGE = 100;

/**
 * The badges `did` defined, most held first, with their holders counted: one
 * call for the definitions, then one count per badge (totals only).
 */
export async function getIssuedBadges(
  did: string,
): Promise<{ badges: IssuedBadge[]; more: boolean }> {
  "use cache";
  publicData(tags.badges(did));

  const { badgeDefinitions, cursor } = await api.call(
    app.certified.badge.listBadgeDefinitions,
    { authors: [did as Did], limit: ISSUED_PAGE },
    read(),
  );
  const details = badgeDefinitions.flatMap((view) => toBadgeDetail(view) ?? []);
  const badges = await Promise.all(
    details.map(async (badge) => {
      const { totalCount } = await api.call(
        app.certified.badge.listBadgeAwards,
        {
          badgeUris: [badge.uri as AtUri],
          responses: ["accepted", "unanswered"],
          limit: 1,
          includeTotal: true,
        },
        read(),
      );
      return { ...badge, holders: totalCount ?? 0 };
    }),
  );
  const [issuer] = details.length > 0 ? await withHandles([details[0].issuer]) : [];
  return {
    badges: badges
      .map((badge) => ({ ...badge, issuer: issuer ?? badge.issuer }))
      .sort((a, b) => b.holders - a.holders),
    more: Boolean(cursor),
  };
}

/** A badge definition, or null when there is none at `uri`. */
export async function getBadge(uri: string): Promise<BadgeDetail | null> {
  "use cache";
  publicData(tags.badge(uri));

  const result = await api.xrpcSafe(app.certified.badge.getBadgeDefinition, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (result.success) {
    const badge = toBadgeDetail(result.body.badgeDefinition);
    if (!badge) return null;
    const [issuer] = await withHandles([badge.issuer]);
    return { ...badge, issuer };
  }
  if (notFound(result)) return null;
  throw result;
}

/** One page of a badge's holders, newest award first. */
export type BadgeHolders = Page<PersonRow> & {
  /** Every award with this response, as the API counts them. */
  total: number;
  /** Awards on this page given to a record (a project, an activity), not an account. */
  records: number;
};

/**
 * Who holds the badge at `uri`, by the recipient's response: accepted, or
 * still unanswered. Awards from issuers the definition doesn't allow are left
 * out (`allowedIssuers`, empty for anyone).
 */
export async function listBadgeHolders(
  uri: string,
  response: "accepted" | "unanswered",
  allowedIssuers: string[],
  cursor?: string,
): Promise<BadgeHolders> {
  "use cache";
  publicData(tags.badge(uri));

  const out = await api.call(
    app.certified.badge.listBadgeAwards,
    {
      badgeUris: [uri as AtUri],
      responses: [response],
      limit: PEOPLE_PAGE,
      includeTotal: true,
      cursor,
    },
    read(),
  );
  const { badgeAwards, totalCount } = out;
  const awards = badgeAwards.filter(
    (award) => allowedIssuers.length === 0 || allowedIssuers.includes(award.author.did),
  );
  const subjectOf = (award: BadgeAwardView) => awardSubject(award.record.subject);
  const dids = [
    ...new Set(
      awards
        .map(subjectOf)
        .filter((subject): subject is string => Boolean(subject?.startsWith("did:"))),
    ),
  ];
  const cards = await actorCards(dids);
  const rows: PersonRow[] = [];
  let records = 0;
  for (const award of awards) {
    const subject = subjectOf(award);
    if (!subject?.startsWith("did:")) {
      records += 1;
      continue;
    }
    const actor = cards.get(subject);
    if (!actor) continue;
    const { note, createdAt } = toEndorsementCard(award); // an award's note and date
    rows.push({ uri: award.uri, actor, note, date: createdAt });
  }
  return {
    items: await withHandlesIn(rows, "actor"),
    cursor: out.cursor ?? null,
    total: totalCount ?? rows.length,
    records,
  };
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
      rkey: collection.uri.split("/").pop() ?? "",
      title: collection.record.title || "Untitled list",
      kind: LIST_KIND[collection.record.type ?? ""] ?? "List",
      itemCount: collection.record.items?.length ?? 0,
      // The short description, else the start of the long one (as staging shows).
      summary: collection.record.shortDescription || plainText(collection.record.description),
    })),
    more: Boolean(cursor),
  };
}

// One list, and its items a page at a time.

export type ListDetail = ListCard & {
  description: string | null;
  /** Its items' addresses, in the list's order. */
  itemUris: string[];
};

/** How many of a list's items a page resolves. */
export const LIST_ITEMS_PAGE = 50;

/** The list `rkey` of `did`, or null when there is none (or it isn't a list). */
export async function getList(did: string, rkey: string): Promise<ListDetail | null> {
  "use cache";
  const uri = `at://${did}/org.hypercerts.collection/${rkey}`;
  publicData(tags.list(uri));

  const result = await api.xrpcSafe(org.hypercerts.collection.getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) {
    if (notFound(result)) return null;
    throw result;
  }
  const { record } = result.body.collection;
  if (!LIST_TYPES.includes(record.type ?? "")) return null;
  const itemUris = (record.items ?? []).flatMap((item) => item.itemIdentifier?.uri ?? []);
  return {
    uri,
    rkey,
    title: record.title || "Untitled list",
    kind: LIST_KIND[record.type ?? ""] ?? "List",
    itemCount: itemUris.length,
    summary: record.shortDescription || null,
    description: plainText(record.description),
    itemUris,
  };
}

const collectionOf = (uri: string) => uri.split("/")[3] ?? "";

/**
 * These items resolved, in their order: accounts in one batch, projects and
 * activities a hundred per call, endorsements one call each.
 */
export async function resolveListItems(uris: string[]): Promise<ListItem[]> {
  "use cache";
  cacheLife("public");
  for (const uri of uris) cacheTag(tags.list(uri));

  const of = (...nsids: string[]) => uris.filter((uri) => nsids.includes(collectionOf(uri)));
  const accountUris = of("app.certified.actor.profile", "app.bsky.actor.profile");
  const projectUris = of("org.hypercerts.collection");
  const activityUris = of("org.hypercerts.claim.activity");
  const awardUris = of("app.certified.badge.award");

  const projects = new Map<string, ProjectCard>();
  const activities = new Map<string, ActivityCard>();
  const awards = new Map<string, BadgeAwardView>();
  await Promise.all([
    ...chunks(projectUris).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.collections) projects.set(view.uri, toProjectCard(view));
    }),
    ...chunks(activityUris).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.activities) activities.set(view.uri, toActivityCard(view));
    }),
    ...awardUris.map(async (uri) => {
      const result = await api.xrpcSafe(app.certified.badge.getBadgeAward, {
        params: { uri: uri as AtUri },
        ...read(),
      });
      if (result.success) awards.set(uri, result.body.badgeAward);
    }),
  ]);

  // Every account the items name: the listed accounts, the projects' authors,
  // and the endorsements' subjects.
  const dids = new Set<string>([
    ...accountUris.map(didOf),
    ...[...projects.values()].map((project) => project.authorDid),
    ...[...awards.values()].flatMap((award) => {
      const subject = awardSubject(award.record.subject);
      return subject?.startsWith("did:") ? [subject] : [];
    }),
  ]);
  const actors = new Map(
    (await withHandles(await getActorCards([...dids]))).map((actor) => [actor.did, actor]),
  );

  return uris.map((uri): ListItem => {
    const project = projects.get(uri);
    if (project) {
      return { kind: "project", uri, project, author: actors.get(project.authorDid) ?? null };
    }
    const activity = activities.get(uri);
    if (activity) return { kind: "activity", uri, activity };
    const award = awards.get(uri);
    if (award) {
      const subject = awardSubject(award.record.subject);
      return {
        kind: "endorsement",
        uri,
        issuer: toActorCard(award.author),
        subject: subject ? (actors.get(subject) ?? null) : null,
        date: formatDate(award.record.createdAt),
      };
    }
    const actor = accountUris.includes(uri) ? actors.get(didOf(uri)) : undefined;
    if (actor) return { kind: "account", uri, actor };
    return { kind: "missing", uri };
  });
}

/** A page of a list's items, from `offset`: for the list's page and "Load more". */
export async function getListItems(list: ListDetail, offset = 0): Promise<Page<ListItem>> {
  const uris = list.itemUris.slice(offset, offset + LIST_ITEMS_PAGE);
  const next = offset + LIST_ITEMS_PAGE;
  return {
    items: await resolveListItems(uris),
    cursor: next < list.itemUris.length ? String(next) : null,
  };
}

// Funding receipts
//
// Receipts by recipient, sender, or what they are for, newest first; each
// with its accounts (sender, recipient, platform, recorder) and what it is
// for resolved. Summaries page through the receipts (the API gives no
// totals), up to FUNDING_PAGES pages.

/**
 * Receipts to or from an account, for a record, or confirmed by an account:
 * written by it, as the platform that processed the payments does (staging's
 * "Confirmed by"; the API filters by author, not by `via`).
 */
export type ReceiptFilter = { to: string } | { from: string } | { for: string } | { by: string };

export type ReceiptRow = Receipt & {
  fromActor: ActorCard | null;
  toActor: ActorCard | null;
  /** Who recorded it: the "Confirmed by" column. */
  recorder: ActorCard;
  /** What it is for, when that is a project or an activity. */
  forTitle: string | null;
  forHref: string | null;
};

/**
 * Pages of receipts a summary reads: 20,000 receipts, enough for every
 * account today (Ma Earth confirmed about 15,000). The API gives no totals.
 */
const FUNDING_PAGES = 200;

function receiptParams(filter: ReceiptFilter) {
  if ("to" in filter) return { to: [filter.to] };
  if ("from" in filter) return { from: [filter.from] };
  if ("by" in filter) return { authors: [filter.by as Did] };
  return { forUris: [filter.for as AtUri] };
}

/** A page of receipts, newest first, with their accounts and subjects. */
export async function listReceiptsPage(
  filter: ReceiptFilter,
  cursor?: string,
): Promise<Page<ReceiptRow>> {
  "use cache";
  publicData(tags.funding(Object.values(filter)[0]));

  const out = await api.call(
    org.hypercerts.funding.listReceipts,
    { ...receiptParams(filter), limit: 50, cursor },
    read(),
  );
  const receipts = out.receipts.map((view) => ({
    receipt: toReceipt({
      uri: view.uri,
      did: view.did,
      record: view.record as Record<string, unknown>,
    }),
    recorder: toActorCard(view.author),
  }));

  // Every account named, and every project or activity funded: batched.
  const dids = new Set<string>();
  const forUris: string[] = [];
  for (const { receipt } of receipts) {
    for (const p of [receipt.from, receipt.to]) if (p.kind === "account") dids.add(p.did);
    if (receipt.forUri) forUris.push(receipt.forUri);
  }
  const subjects = new Map<string, { title: string; href: string }>();
  await Promise.all([
    ...chunks([
      ...new Set(forUris.filter((uri) => uri.includes("/org.hypercerts.collection/"))),
    ]).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.collections) {
        const project = toProjectCard(view);
        subjects.set(view.uri, { title: project.title, href: projectHrefOf(project) });
      }
    }),
    ...chunks([
      ...new Set(forUris.filter((uri) => uri.includes("/org.hypercerts.claim.activity/"))),
    ]).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.activities) {
        const activity = toActivityCard(view);
        subjects.set(view.uri, { title: activity.title, href: activityHrefOf(activity.uri) });
      }
    }),
  ]);
  const actors = new Map(
    (await withHandles(await getActorCards([...dids]))).map((actor) => [actor.did, actor]),
  );
  const [recorders] = [await withHandles(receipts.map((r) => r.recorder))];

  return {
    items: receipts.map(({ receipt }, i) => {
      const subject = receipt.forUri ? subjects.get(receipt.forUri) : undefined;
      return {
        ...receipt,
        fromActor: receipt.from.kind === "account" ? (actors.get(receipt.from.did) ?? null) : null,
        toActor: receipt.to.kind === "account" ? (actors.get(receipt.to.did) ?? null) : null,
        recorder: recorders[i],
        forTitle: subject?.title ?? null,
        forHref: subject?.href ?? null,
      };
    }),
    cursor: out.cursor ?? null,
  };
}

export type FundingSummary = {
  /** Totals by currency, largest first. */
  totals: { currency: string; amount: string }[];
  gifts: number;
  /** Distinct senders named (an account or a wallet). */
  namedDonors: number;
  anonymousGifts: number;
  /** Whether it stopped at FUNDING_PAGES with more to read. */
  capped: boolean;
};

/**
 * What the receipts add up to: totals, gifts, donors. Kept for hours, not the
 * minute public data is: a large account takes many calls to add up.
 */
export async function getFundingSummary(filter: ReceiptFilter): Promise<FundingSummary> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.funding(Object.values(filter)[0]));

  const receipts: Receipt[] = [];
  let cursor: string | undefined;
  let capped = false;
  for (let page = 0; page < FUNDING_PAGES; page++) {
    const out = await api.call(
      org.hypercerts.funding.listReceipts,
      { ...receiptParams(filter), limit: 100, cursor },
      read(),
    );
    for (const view of out.receipts) {
      receipts.push(
        toReceipt({ uri: view.uri, did: view.did, record: view.record as Record<string, unknown> }),
      );
    }
    cursor = out.cursor;
    if (!cursor) break;
    if (page === FUNDING_PAGES - 1) capped = true;
  }
  const donors = new Set(
    receipts.flatMap((r) =>
      r.from.kind === "account" ? [r.from.did] : r.from.kind === "text" ? [r.from.value] : [],
    ),
  );
  return {
    totals: totalsByCurrency(receipts),
    gifts: receipts.length,
    namedDonors: donors.size,
    anonymousGifts: receipts.filter((r) => r.from.kind === "anonymous").length,
    capped,
  };
}

/** Whether an account received, gave or confirmed any funding: its profile's Funding tab. */
export async function hasFunding(
  did: string,
): Promise<{ received: boolean; given: boolean; confirmed: boolean }> {
  "use cache";
  publicData(tags.funding(did));

  const [received, given, confirmed] = await Promise.all([
    api.call(org.hypercerts.funding.listReceipts, { to: [did], limit: 1 }, read()),
    api.call(org.hypercerts.funding.listReceipts, { from: [did], limit: 1 }, read()),
    api.call(org.hypercerts.funding.listReceipts, { authors: [did as Did], limit: 1 }, read()),
  ]);
  return {
    received: received.receipts.length > 0,
    given: given.receipts.length > 0,
    confirmed: confirmed.receipts.length > 0,
  };
}

const projectHrefOf = (project: ProjectCard) => `/${project.authorDid}/project/${project.rkey}`;
const activityHrefOf = (uri: string) => `/${didOf(uri)}/activity/${uri.split("/").pop()}`;

/** An activity for its own page: its card, and its full description. */
export async function getActivity(
  uri: string,
): Promise<(ActivityCard & { description: string | null }) | null> {
  "use cache";
  publicData(tags.activities(didOf(uri)));

  const result = await api.xrpcSafe(org.hypercerts.claim.getActivity, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) {
    if (notFound(result)) return null;
    throw result;
  }
  const { activity } = result.body;
  const [card] = await withHandlesIn([toActivityCard(activity)], "author");
  return { ...card, description: plainText(activity.record.description) };
}

// Explore
//
// The network's activities, projects and accounts, newest or oldest first,
// listed or searched; and Featured, the picks Ma Earth curates as lists.

export type ExploreSort = "newest" | "oldest";
export type AccountType = "all" | "people" | "organizations";

export const EXPLORE_PAGE = 24;

const sortDirection = (sort: ExploreSort): "asc" | "desc" => (sort === "oldest" ? "asc" : "desc");

export async function exploreActivities(options: {
  query?: string;
  sort: ExploreSort;
  cursor?: string;
  limit: number;
}): Promise<Page<ExploreActivity>> {
  "use cache";
  publicData(tags.explore());

  const params = {
    sortDirection: sortDirection(options.sort),
    cursor: options.cursor,
    limit: options.limit,
  } as const;
  const { activities, cursor } = options.query
    ? await api.call(
        org.hypercerts.claim.searchActivities,
        { ...params, search: options.query },
        read(),
      )
    : await api.call(org.hypercerts.claim.listActivities, params, read());
  const now = Date.now();
  return {
    items: await withHandlesIn(
      activities.map((activity) => toExploreActivity(activity, now)),
      "author",
    ),
    cursor: cursor ?? null,
  };
}

export async function exploreProjects(options: {
  query?: string;
  sort: ExploreSort;
  cursor?: string;
  limit: number;
}): Promise<Page<ExploreProject>> {
  "use cache";
  publicData(tags.explore());

  const params = {
    types: ["project"],
    sortDirection: sortDirection(options.sort),
    cursor: options.cursor,
    limit: options.limit,
  };
  const { collections, cursor } = options.query
    ? await api.call(
        org.hypercerts.collection.searchCollections,
        { ...params, search: options.query },
        read(),
      )
    : await api.call(org.hypercerts.collection.listCollections, params, read());
  const now = Date.now();
  return {
    items: await withHandlesIn(
      collections.map((collection) => toExploreProject(collection, now)),
      "author",
    ),
    cursor: cursor ?? null,
  };
}

/** An organization asked not to be listed: its page stays reachable, Explore leaves it out. */
type OrganizationView = app.certified.actor.getOrganization.OrganizationActorView;
const unlisted = (view: OrganizationView | null | undefined) =>
  view?.organization?.record.visibility === "unlisted";

/** An account, dated by its profile (or, without one, its organization record). */
function toExploreAccount(view: OrganizationView | ActorCardInput, now: number): ExploreAccount {
  const created = view.profile?.record.createdAt ?? view.organization?.record.createdAt;
  return { ...toActorCard(view), age: toAge(created, now) };
}
type ActorCardInput = Parameters<typeof toActorCard>[0];

/** The organization records of these accounts, those that have one. */
async function organizationsOf(dids: string[]): Promise<Map<string, OrganizationView>> {
  if (dids.length === 0) return new Map();
  const { organizations } = await api.call(
    app.certified.actor.getOrganizations,
    { actors: dids as Did[] },
    read(),
  );
  return new Map(
    organizations.flatMap((result) =>
      result.organization ? [[result.actor, result.organization] as const] : [],
    ),
  );
}

/** A page of profiles (people and organizations alike), with their organization records. */
async function profilePage(options: {
  query?: string;
  sort: ExploreSort;
  cursor?: string;
  limit: number;
}) {
  const params = {
    sortDirection: sortDirection(options.sort),
    cursor: options.cursor,
    limit: options.limit,
  } as const;
  const { profiles, cursor } = options.query
    ? await api.call(
        app.certified.actor.searchProfiles,
        { ...params, search: options.query },
        read(),
      )
    : await api.call(app.certified.actor.listProfiles, params, read());
  const organizations = await organizationsOf(profiles.map((profile) => profile.did));
  return { profiles, organizations, cursor: cursor ?? null };
}

/** How many pages of profiles People reads, at most, to fill one of its own. */
const PEOPLE_READS = 4;

/**
 * Accounts: everyone (profiles, organizations among them), organizations
 * only, or people only. The API lists profiles and organizations but not
 * people, so People reads profiles and leaves the organizations out, reading
 * on (a few pages at most) until it has a page's worth.
 */
export async function exploreAccounts(options: {
  query?: string;
  sort: ExploreSort;
  type: AccountType;
  cursor?: string;
  limit: number;
}): Promise<Page<ExploreAccount>> {
  "use cache";
  publicData(tags.explore());
  const now = Date.now();

  if (options.type === "organizations") {
    const params = {
      sortDirection: sortDirection(options.sort),
      cursor: options.cursor,
      limit: options.limit,
    } as const;
    const { actors, cursor } = options.query
      ? await api.call(
          app.certified.actor.searchOrganizations,
          { ...params, search: options.query },
          read(),
        )
      : await api.call(app.certified.actor.listOrganizations, params, read());
    const listed = actors.filter((actor) => !unlisted(actor));
    return {
      items: await withHandles(listed.map((actor) => toExploreAccount(actor, now))),
      cursor: cursor ?? null,
    };
  }

  const items: ExploreAccount[] = [];
  let cursor: string | null = options.cursor ?? null;
  for (let read = 0; read < (options.type === "people" ? PEOPLE_READS : 1); read++) {
    const page = await profilePage({ ...options, cursor: cursor ?? undefined });
    for (const profile of page.profiles) {
      const organization = page.organizations.get(profile.did);
      if (options.type === "people" && organization) continue;
      if (unlisted(organization)) continue;
      items.push(
        toExploreAccount(organization ?? { did: profile.did, profile, organization: null }, now),
      );
    }
    cursor = page.cursor;
    if (!cursor || items.length >= options.limit) break;
  }
  return { items: await withHandles(items), cursor };
}

export type FeaturedKind = "activities" | "projects" | "accounts";

/**
 * Featured: Ma Earth's funding rounds, kept as lists on the hypercerts.org
 * account (as on staging), latest round first.
 */
const FEATURED_LISTS: Record<FeaturedKind, string[]> = {
  activities: ["3mmrtsu7thf2j", "3mmrvaih43w2j", "3mmrr5xafi42z"],
  projects: ["3mmrtyyadrc2s", "3mmrtpxcmfs2z", "3mmrravn7kl2s"],
  accounts: ["3mmrt4snnh72t", "3mmrtqoixzv2z", "3mmrvar2ofs24"],
};
const FEATURED_CURATOR = "did:plc:s4puetfspot742ai7y4otuel";
const FEATURED_RECORDS: Record<FeaturedKind, string> = {
  activities: "org.hypercerts.claim.activity",
  projects: "org.hypercerts.collection",
  accounts: "app.certified.actor.profile",
};

/**
 * The featured records of one kind, by URI, each once: activities and
 * projects newest first; accounts in the lists' order (latest round first).
 */
async function featuredUris(kind: FeaturedKind): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const uris = FEATURED_LISTS[kind].map(
    (rkey) => `at://${FEATURED_CURATOR}/org.hypercerts.collection/${rkey}`,
  );
  for (const uri of uris) cacheTag(tags.list(uri));
  const { collections } = await api.call(
    org.hypercerts.collection.listCollections,
    { uris: uris as AtUri[], limit: uris.length },
    read(),
  );
  const byUri = new Map<string, (typeof collections)[number]>(
    collections.map((collection) => [collection.uri, collection]),
  );
  const items = uris.flatMap((uri) =>
    (byUri.get(uri)?.record.items ?? []).map((item) => item.itemIdentifier.uri),
  );
  const featured = [
    ...new Set(items.filter((uri) => collectionOf(uri) === FEATURED_RECORDS[kind])),
  ];
  if (kind === "accounts") return featured;
  // Activities and projects newest first, by their own createdAt: read their
  // records a hundred at a time (cached with the list, for hours).
  const created = new Map<string, string>();
  await Promise.all(
    chunks(featured).map(async (batch) => {
      const page =
        kind === "activities"
          ? (
              await api.call(
                org.hypercerts.claim.listActivities,
                { uris: batch as AtUri[], limit: 100 },
                read(),
              )
            ).activities
          : (
              await api.call(
                org.hypercerts.collection.listCollections,
                { uris: batch as AtUri[], limit: 100 },
                read(),
              )
            ).collections;
      for (const view of page) created.set(view.uri, String(view.record.createdAt ?? ""));
    }),
  );
  return featured
    .filter((uri) => created.has(uri))
    .sort((a, b) => (created.get(b) ?? "").localeCompare(created.get(a) ?? ""));
}

/** A page of Featured, from `offset` (its cursor), newest or oldest first. */
export async function exploreFeatured<K extends FeaturedKind>(
  kind: K,
  offset: number,
  limit: number,
  sort: ExploreSort = "newest",
): Promise<Page<ExploreItem<K>>> {
  "use cache";
  publicData(tags.explore());
  const listed = await featuredUris(kind);
  const all = sort === "oldest" ? [...listed].reverse() : listed;
  const uris = all.slice(offset, offset + limit);
  const cursor = offset + limit < all.length ? String(offset + limit) : null;
  const now = Date.now();
  const inOrder = <T extends { uri: string }>(items: T[]) => {
    const byUri = new Map(items.map((item) => [item.uri, item]));
    return uris.flatMap((uri) => byUri.get(uri) ?? []);
  };

  if (kind === "accounts") {
    const cards = await getActorCards(uris.map(didOf));
    const items = cards.map((card) => ({ ...card, age: null }));
    return { items: items as ExploreItem<K>[], cursor };
  }
  if (kind === "projects") {
    const { collections } = await api.call(
      org.hypercerts.collection.listCollections,
      { uris: uris as AtUri[], limit: 100 },
      read(),
    );
    const items = await withHandlesIn(
      inOrder(collections.map((collection) => toExploreProject(collection, now))),
      "author",
    );
    return { items: items as ExploreItem<K>[], cursor };
  }
  const { activities } = await api.call(
    org.hypercerts.claim.listActivities,
    { uris: uris as AtUri[], limit: 100 },
    read(),
  );
  const items = await withHandlesIn(
    inOrder(activities.map((activity) => toExploreActivity(activity, now))),
    "author",
  );
  return { items: items as ExploreItem<K>[], cursor };
}

export type ExploreItem<K extends FeaturedKind> = K extends "activities"
  ? ExploreActivity
  : K extends "projects"
    ? ExploreProject
    : ExploreAccount;

// Profile feed
//
// What an account did, newest first, merged from what the API lists by
// author or subject: activities and projects it published, endorsements
// given and received, badges received and awarded, follows, gifts. Each kind
// is read a page at a time, newest first, and the pages are merged by date;
// the cursor keeps where each kind stopped, so Load more continues every kind
// in order and nothing older shows before something newer that wasn't read.

const FEED_SOURCES = [
  "activities",
  "projects",
  "awardsGiven",
  "awardsReceived",
  "followers",
  "following",
  "projectsFollowed",
  "giftsReceived",
  "giftsGiven",
  "giftsRecorded",
] as const;
type FeedSource = (typeof FEED_SOURCES)[number];

/** Records read per kind per request. */
const FEED_SOURCE_PAGE = 25;
/** Events per page of the feed, before grouping. */
const FEED_EVENTS = 40;

const timeOf = (value: unknown) => {
  const time = typeof value === "string" ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
};

const isEndorsement = (award: BadgeAwardView) => award.badge?.record.badgeType === "endorsement";

const badgeLink = (award: BadgeAwardView) => {
  const uri = award.badge?.uri ?? "";
  return {
    title: String(award.badge?.record.title ?? "").trim() || "A badge",
    href: `/${didOf(uri)}/badge/${uri.split("/").pop()}`,
  };
};

/** One page of one kind of event, newest first. */
async function feedSourcePage(
  source: FeedSource,
  did: string,
  cursor: string | undefined,
): Promise<{ events: FeedEvent[]; cursor: string | null }> {
  "use cache";
  publicData(tags.actor(did));

  const limit = FEED_SOURCE_PAGE;
  const author = [did as Did];
  switch (source) {
    case "activities": {
      const out = await api.call(
        org.hypercerts.claim.listActivities,
        { authors: author, limit, cursor },
        read(),
      );
      return {
        events: out.activities.map((view) => ({
          kind: "activity",
          key: view.uri,
          time: timeOf(view.record.createdAt),
          activity: toActivityCard(view),
        })),
        cursor: out.cursor ?? null,
      };
    }
    case "projects": {
      const out = await api.call(
        org.hypercerts.collection.listCollections,
        { authors: author, types: ["project"], limit, cursor },
        read(),
      );
      return {
        events: out.collections.map((view) => ({
          kind: "project",
          key: view.uri,
          time: timeOf(view.record.createdAt),
          project: toProjectCard(view),
        })),
        cursor: out.cursor ?? null,
      };
    }
    case "awardsGiven": {
      const out = await api.call(
        app.certified.badge.listBadgeAwards,
        { authors: author, limit, cursor },
        read(),
      );
      return {
        events: out.badgeAwards.map((award): FeedEvent => {
          const base = { key: award.uri, time: timeOf(award.record.createdAt) };
          const subject = awardSubject(award.record.subject);
          if (isEndorsement(award)) {
            const card = toEndorsementCard(award);
            return { ...base, kind: "endorsed", subject, badge: card.badge, note: card.note };
          }
          return { ...base, kind: "awarded", badge: badgeLink(award), recipient: subject };
        }),
        cursor: out.cursor ?? null,
      };
    }
    case "awardsReceived": {
      const out = await api.call(
        app.certified.badge.listBadgeAwards,
        { subjects: [did], responses: ["accepted", "unanswered"], limit, cursor },
        read(),
      );
      const now = Date.now();
      return {
        events: out.badgeAwards.flatMap((award): FeedEvent[] => {
          const base = { key: award.uri, time: timeOf(award.record.createdAt) };
          if (isEndorsement(award)) {
            const card = toEndorsementCard(award);
            return [
              {
                ...base,
                kind: "endorsedBy",
                issuer: card.issuer,
                badge: card.badge,
                note: card.note,
              },
            ];
          }
          // A badge is the account's once it accepts it.
          const badge = award.responseStatus === "accepted" ? toBadgeCard(award, now) : null;
          return badge ? [{ ...base, kind: "badge", badge }] : [];
        }),
        cursor: out.cursor ?? null,
      };
    }
    case "followers":
    case "following": {
      const params = { actor: did as Did, limit, cursor };
      const out =
        source === "followers"
          ? await api
              .call(app.certified.graph.listActorFollowers, params, read())
              .then((page) => ({ views: page.followers, cursor: page.cursor }))
          : await api
              .call(app.certified.graph.listActorFollowing, params, read())
              .then((page) => ({ views: page.following, cursor: page.cursor }));
      return {
        events: out.views.map((view) => ({
          kind: source === "followers" ? "follower" : "followed",
          key: view.follow.uri,
          time: timeOf(view.follow.record.createdAt),
          actor: toActorCard({
            did: view.did,
            profile: view.profile,
            organization: view.organization,
          }),
        })),
        cursor: out.cursor ?? null,
      };
    }
    case "projectsFollowed": {
      const out = await api.call(
        app.certified.graph.listEntityFollowing,
        { actor: did as Did, limit, cursor },
        read(),
      );
      return {
        events: out.entities.flatMap((item): FeedEvent[] => {
          const entity = item.entity as { $type?: string } & CollectionViewLike;
          if (entity.$type !== "org.hypercerts.collection.getCollection#collectionView") return [];
          const project = toProjectCard(entity as Parameters<typeof toProjectCard>[0]);
          return [
            {
              kind: "followedProject",
              key: item.follow.uri,
              time: timeOf(item.follow.record.createdAt),
              project: {
                title: project.title,
                href: `/${project.authorDid}/project/${project.rkey}`,
              },
            },
          ];
        }),
        cursor: out.cursor ?? null,
      };
    }
    case "giftsReceived":
    case "giftsGiven":
    case "giftsRecorded": {
      const filter =
        source === "giftsReceived"
          ? { to: [did] }
          : source === "giftsGiven"
            ? { from: [did] }
            : { authors: author };
      const out = await api.call(
        org.hypercerts.funding.listReceipts,
        { ...filter, limit, cursor },
        read(),
      );
      const direction =
        source === "giftsReceived" ? "received" : source === "giftsGiven" ? "given" : "recorded";
      return {
        events: out.receipts.map((view) => {
          const receipt = toReceipt(view);
          const from = receipt.from;
          return {
            kind: "gift",
            key: view.uri,
            time: timeOf(view.record.createdAt),
            direction,
            value: receipt.value,
            currency: receipt.currency,
            donor: from.kind === "account" ? from.did : from.kind === "text" ? from.value : null,
          };
        }),
        cursor: out.cursor ?? null,
      };
    }
  }
}
type CollectionViewLike = Record<string, unknown>;

/** Where each kind stopped: the page it is reading (null: the first) and how far into it. */
type FeedState = Partial<Record<FeedSource, { c: string | null; o: number } | "done">>;

const encodeFeedCursor = (state: FeedState) =>
  Buffer.from(JSON.stringify(state)).toString("base64url");

function decodeFeedCursor(cursor: string | undefined): FeedState | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as FeedState;
  } catch {
    return null;
  }
}

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function coveredByProject(activity: ActivityCard, projects: ProjectCard[]): boolean {
  return projects.some(
    (project) =>
      sameTitle(project.title, activity.title) && project.activityUris.includes(activity.uri),
  );
}

/** A page of an account's feed: rows, newest first, and where the next page starts. */
export async function getProfileFeed(did: string, cursor?: string): Promise<Page<FeedRow>> {
  "use cache";
  publicData(tags.actor(did));

  const state: FeedState =
    decodeFeedCursor(cursor) ??
    Object.fromEntries(FEED_SOURCES.map((source) => [source, { c: null, o: 0 }]));
  const pages = new Map<FeedSource, { events: FeedEvent[]; cursor: string | null }>();
  const load = async (source: FeedSource) => {
    const at = state[source];
    if (!at || at === "done") return;
    pages.set(source, await feedSourcePage(source, did, at.c ?? undefined));
  };
  await Promise.all(FEED_SOURCES.map(load));

  // The next event of a kind, reading its next page when this one is used up.
  const next = async (source: FeedSource): Promise<FeedEvent | null> => {
    const at = state[source];
    const page = pages.get(source);
    if (!at || at === "done" || !page) return null;
    if (at.o < page.events.length) return page.events[at.o];
    if (!page.cursor) {
      state[source] = "done";
      return null;
    }
    state[source] = { c: page.cursor, o: 0 };
    await load(source);
    return next(source);
  };

  const taken: FeedEvent[] = [];
  while (taken.length < FEED_EVENTS) {
    const heads = await Promise.all(
      FEED_SOURCES.map(async (source) => ({ source, event: await next(source) })),
    );
    let newest: { source: FeedSource; event: FeedEvent } | null = null;
    for (const head of heads) {
      if (head.event && (!newest || head.event.time > newest.event.time)) {
        newest = { source: head.source, event: head.event };
      }
    }
    if (!newest) break;
    taken.push(newest.event);
    const at = state[newest.source];
    if (at && at !== "done") at.o += 1;
  }
  // A kind whose page is used up and has no next one is done.
  await Promise.all(FEED_SOURCES.map(next));
  const more = FEED_SOURCES.some((source) => state[source] && state[source] !== "done");

  // Cards for the accounts the events name by DID.
  const dids = new Set<string>();
  for (const event of taken) {
    if (event.kind === "endorsed" && event.subject?.startsWith("did:")) dids.add(event.subject);
    if (event.kind === "awarded" && event.recipient?.startsWith("did:")) dids.add(event.recipient);
  }
  const cards = new Map((await getActorCards([...dids])).map((card) => [card.did, card]));

  // An activity its own same-titled project holds: the project's row stands
  // for both (an organization often makes one of each for the same work).
  const projects = taken.flatMap((event) => (event.kind === "project" ? [event.project] : []));
  const shown = taken.filter(
    (event) => event.kind !== "activity" || !coveredByProject(event.activity, projects),
  );

  return {
    items: await withFeedHandles(groupFeed(shown, cards)),
    cursor: more ? encodeFeedCursor(state) : null,
  };
}

/** How many accounts a grouped row names; the rest it counts. */
const GROUP_NAMED = 3;

/**
 * Rows from events, newest first: gifts, followers, follows and badges
 * awarded come together per day (and per badge), at their newest's place.
 */
function groupFeed(events: FeedEvent[], cards: Map<string, ActorCard>): FeedRow[] {
  const rows: FeedRow[] = [];
  const groups = new Map<string, FeedRow>();
  const sums = new Map<string, Map<string, number>>();
  const donors = new Map<string, Set<string>>();
  for (const event of events) {
    const date = formatDate(new Date(event.time).toISOString());
    const day = dayOf(event.time);
    switch (event.kind) {
      case "activity":
      case "project":
      case "badge":
        rows.push({ ...event, date } as FeedRow);
        break;
      case "endorsedBy":
        rows.push({ ...event, date });
        break;
      case "endorsed": {
        const id = `endorsed:${day}:${event.badge ?? ""}`;
        const row = groups.get(id);
        const subject = event.subject ? cards.get(event.subject) : undefined;
        if (row?.kind === "endorsed") {
          row.count += 1;
          row.note = null;
          if (subject && row.subjects.length < GROUP_NAMED) row.subjects.push(subject);
        } else {
          const created: FeedRow = {
            key: event.key,
            date,
            kind: "endorsed",
            subjects: subject ? [subject] : [],
            count: 1,
            badge: event.badge,
            note: event.note,
          };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "awarded": {
        const id = `awarded:${day}:${event.badge.href}`;
        const row = groups.get(id);
        const recipient = event.recipient ? cards.get(event.recipient) : undefined;
        if (row?.kind === "awarded") {
          row.count += 1;
          if (recipient && row.recipients.length < GROUP_NAMED) row.recipients.push(recipient);
        } else {
          const created: FeedRow = {
            key: event.key,
            date,
            kind: "awarded",
            badge: event.badge,
            count: 1,
            recipients: recipient ? [recipient] : [],
          };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "follower":
      case "followed": {
        const kind = event.kind === "follower" ? "followers" : "following";
        const id = `${kind}:${day}`;
        const row = groups.get(id);
        if (row && (row.kind === "followers" || row.kind === "following")) {
          row.count += 1;
          if (row.actors.length < GROUP_NAMED) row.actors.push(event.actor);
        } else {
          const created: FeedRow = { key: event.key, date, kind, count: 1, actors: [event.actor] };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "followedProject": {
        const id = `projectsFollowed:${day}`;
        const row = groups.get(id);
        if (row?.kind === "projectsFollowed") {
          row.count += 1;
          if (row.projects.length < GROUP_NAMED) row.projects.push(event.project);
        } else {
          const created: FeedRow = {
            key: event.key,
            date,
            kind: "projectsFollowed",
            count: 1,
            projects: [event.project],
          };
          groups.set(id, created);
          rows.push(created);
        }
        break;
      }
      case "gift": {
        const id = `gifts:${event.direction}:${day}`;
        let row = groups.get(id);
        if (row?.kind !== "gifts") {
          row = {
            key: event.key,
            date,
            kind: "gifts",
            direction: event.direction,
            count: 0,
            totals: [],
            donors: 0,
          };
          groups.set(id, row);
          sums.set(id, new Map());
          donors.set(id, new Set());
          rows.push(row);
        }
        row.count += 1;
        if (event.value !== null && Number.isFinite(event.value) && event.currency) {
          const sum = sums.get(id);
          sum?.set(event.currency, (sum.get(event.currency) ?? 0) + event.value);
        }
        if (event.donor) donors.get(id)?.add(event.donor);
        row.donors = donors.get(id)?.size ?? 0;
        row.totals = [...(sums.get(id) ?? new Map<string, number>()).entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([currency, sum]) => ({ currency, amount: formatMoney(String(sum), currency) }));
        break;
      }
    }
  }
  return rows;
}

/** The rows' accounts with their verified handles, for links. */
async function withFeedHandles(rows: FeedRow[]): Promise<FeedRow[]> {
  const all = rows.flatMap((row): ActorCard[] => {
    if (row.kind === "endorsed") return row.subjects;
    if (row.kind === "endorsedBy") return [row.issuer];
    if (row.kind === "awarded") return row.recipients;
    if (row.kind === "followers" || row.kind === "following") return row.actors;
    return [];
  });
  const named = new Map((await withHandles(all)).map((card) => [card.did, card]));
  const card = (actor: ActorCard) => named.get(actor.did) ?? actor;
  return rows.map((row) => {
    if (row.kind === "endorsed") return { ...row, subjects: row.subjects.map(card) };
    if (row.kind === "endorsedBy") return { ...row, issuer: card(row.issuer) };
    if (row.kind === "awarded") return { ...row, recipients: row.recipients.map(card) };
    if (row.kind === "followers" || row.kind === "following") {
      return { ...row, actors: row.actors.map(card) };
    }
    return row;
  });
}
