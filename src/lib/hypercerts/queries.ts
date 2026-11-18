// Read queries against the Hypercerts API.
//
// Every page, route handler and embed reads through these functions; nothing
// else talks to the API. They call the XRPC endpoints with @atproto/lex and
// the query definitions from @hypercerts-org/api. When the Hypercerts SDK
// ships its read layer, only the bodies of these functions should change.
import "server-only";

import { Client, type l } from "@atproto/lex";
import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { getDid, getHandle } from "@/lib/identity";
import { tags } from "./cache";
import {
  type ActivityCard,
  type ActorCard,
  type ActorDetail,
  type AwardSubject,
  type AwardsIssued,
  activityRecord,
  awardSubject,
  collectionOf,
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
  return failure.error === "RecordNotFound" || failure.message.includes("RecordNotFound:");
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
  const [organization, handle] = await (byDid ?? lookups(did));

  if (organization.success) {
    const detail = { ...toActorDetail(organization.body.actor), handle };
    const location = organization.body.actor.organization?.record.location?.uri;
    return location ? { ...detail, place: await placeName(location) } : detail;
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
 * A location record's name, cut to its last two parts ("Wilmington, New
 * Castle County, Delaware, United States" reads "Delaware, United States"),
 * or null. A missing or unreadable location never fails the profile.
 */
async function placeName(uri: string): Promise<string | null> {
  const result = await api.xrpcSafe(app.certified.location.getLocation, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  const name = result.success ? result.body.location.record.name : undefined;
  if (!name) return null;
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
const ENDORSEMENT = "endorsement";

// Badge awards issued
//
// The API has no count for badge awards (proposed in TECH-810), so
// issuedAwardsSource pages through every award the account has issued, once
// per cache lifetime, and keeps a plain summary. Accounts with more than
// MAX_ISSUED_AWARDS awards are cut off there. Counts are award records, with
// no interpretation of what a badge means.
const MAX_ISSUED_AWARDS = 2_000;
const RECENT_AWARDS_SHOWN = 8;

type IssuedAwardsSource = {
  // Most recent first, as the API returns them.
  awards: { uri: string; badge: string; subject: string }[];
  definitions: Record<string, { title: string; badgeType: string | null; owner: string }>;
  truncated: boolean;
};

async function issuedAwardsSource(did: string): Promise<IssuedAwardsSource> {
  "use cache";
  publicData(tags.awardsIssued(did));

  const source: IssuedAwardsSource = {
    awards: [],
    definitions: {},
    truncated: false,
  };
  let cursor: string | undefined;
  do {
    const page = await api.call(
      app.certified.badge.listBadgeAwards,
      { authors: [did as Did], limit: 100, cursor },
      read(),
    );
    for (const award of page.badgeAwards) {
      const subject = awardSubject(award.record.subject);
      const badge = award.record.badge.uri;
      // Endorsements have their own section (getEndorsements).
      if (!subject || award.badge?.record.badgeType === ENDORSEMENT) continue;
      source.awards.push({ uri: award.uri, badge, subject });
      source.definitions[badge] ??= {
        title: award.badge?.record.title || "Untitled badge",
        badgeType: award.badge?.record.badgeType ?? null,
        owner: award.badge?.did ?? didOf(badge),
      };
    }
    cursor = page.cursor;
  } while (cursor && source.awards.length < MAX_ISSUED_AWARDS);
  source.truncated = Boolean(cursor);
  return source;
}

function chunks<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

async function projectCards(uris: string[]): Promise<Map<string, ProjectCard>> {
  const cards = new Map<string, ProjectCard>();
  for (const batch of chunks(uris)) {
    const { collections } = await api.call(
      org.hypercerts.collection.listCollections,
      { uris: batch as AtUri[], limit: 100 },
      read(),
    );
    for (const collection of collections) cards.set(collection.uri, toProjectCard(collection));
  }
  return cards;
}

export async function getAwardsIssued(did: string): Promise<AwardsIssued | null> {
  "use cache";
  publicData(tags.awardsIssued(did));

  const source = await issuedAwardsSource(did);
  if (source.awards.length === 0) return null;

  const awardsByBadge = new Map<string, IssuedAwardsSource["awards"]>();
  for (const award of source.awards) {
    const awards = awardsByBadge.get(award.badge) ?? [];
    awards.push(award);
    awardsByBadge.set(award.badge, awards);
  }
  const grouped = [...awardsByBadge].sort((a, b) => b[1].length - a[1].length);
  const shown = grouped.flatMap(([, awards]) =>
    awards.slice(0, RECENT_AWARDS_SHOWN).map((award) => award.subject),
  );

  const definers = Object.values(source.definitions)
    .map((definition) => definition.owner)
    .filter((owner) => owner !== did);
  const actors = await actorCards([
    ...new Set([...shown.filter((s) => s.startsWith("did:")), ...definers]),
  ]);
  const projects = await projectCards([
    ...new Set(shown.filter((s) => collectionOf(s) === "org.hypercerts.collection")),
  ]);

  const subjectView = (subject: string): AwardSubject => {
    const actor = actors.get(subject);
    if (actor) return { kind: "actor", actor };
    const project = projects.get(subject);
    if (project) return { kind: "project", project };
    return subject.startsWith("did:")
      ? {
          kind: "actor",
          actor: toActorCard({
            did: subject as Did,
            profile: null,
            organization: null,
          }),
        }
      : { kind: "record", uri: subject };
  };

  return {
    did,
    awardCount: source.awards.length,
    truncated: source.truncated,
    badges: grouped.map(([uri, awards]) => {
      const definition = source.definitions[uri];
      return {
        uri,
        title: definition.title,
        badgeType: definition.badgeType,
        definedBy: definition.owner === did ? null : (actors.get(definition.owner) ?? null),
        awardCount: awards.length,
        recentAwards: awards.slice(0, RECENT_AWARDS_SHOWN).map((award) => ({
          uri: award.uri,
          subject: subjectView(award.subject),
        })),
      };
    }),
  };
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
  const [received, given] = await Promise.all([
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
      { authors: [did as Did], badgeTypes, includeTotal: true, limit: 1 },
      read(),
    ),
  ]);
  return {
    receivedCount: received.totalCount ?? received.badgeAwards.length,
    given: given.totalCount ?? given.badgeAwards.length,
    latestReceived: await withHandlesIn(received.badgeAwards.map(toEndorsementCard), "issuer"),
  };
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
export async function listEndorsements(
  did: string,
  direction: "received" | "given",
): Promise<PeoplePage> {
  "use cache";
  publicData(tags.endorsements(did));

  const { badgeAwards, cursor } = await api.call(
    app.certified.badge.listBadgeAwards,
    direction === "received"
      ? {
          subjects: [did],
          badgeTypes: ["endorsement"],
          responses: ["accepted", "unanswered"],
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
    rows.push({ uri: award.uri, actor, note: card.note, date: card.createdAt });
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
