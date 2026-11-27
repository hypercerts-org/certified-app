// Read queries against the Hypercerts API.
//
// Every page and route handler reads through these functions; nothing
// else talks to the API. They call the XRPC endpoints with @atproto/lex and
// the query definitions from @hypercerts-org/api. When the Hypercerts SDK
// ships its read layer, only the bodies of these functions should change.
import "server-only";

import { Client, l } from "@atproto/lex";
import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getBlobText } from "@/lib/blobs";
import { getPlaceLabel } from "@/lib/geocode";
import { getDid, getHandle, getPdsUrl } from "@/lib/identity";
import { logError } from "@/lib/log";
import { type RichText, richTextOf } from "@/lib/rich-text";
import { isDid as isDidParam } from "@/lib/validate";
import { tags } from "./cache";
import {
  type ActivityCard,
  type ActorCard,
  type ActorDetail,
  type Attachment,
  awardSubject,
  type BadgeCard,
  type BadgeDetail,
  type Contributor,
  didOf,
  ENDORSEMENT_BADGE_TYPE,
  type EndorsementCard,
  type EndorsementRef,
  type Evaluation,
  type ExploreAccount,
  type ExploreActivity,
  type ExploreProject,
  type FeedEvent,
  type FeedLink,
  type FeedRow,
  type FeedTarget,
  type FollowRef,
  formatDate,
  formatMoney,
  type LatestRecord,
  type ListCard,
  type ListItem,
  locationBlobCid,
  type Measurement,
  type Page,
  type PersonRow,
  PLAIN_ENDORSEMENT,
  type Place,
  type ProfileVersion,
  type ProjectCard,
  type ProjectDetail,
  plainText,
  type Receipt,
  sortBadges,
  toActivityCard,
  toActorCard,
  toActorDetail,
  toAge,
  toAttachment,
  toBadgeCard,
  toBadgeDetail,
  toContributors,
  toEndorsementCard,
  toEvaluation,
  toExploreActivity,
  toExploreProject,
  toMeasurement,
  toPlace,
  toProfileVersion,
  toProjectCard,
  toProjectDetail,
  toReceipt,
  totalsByCurrency,
  toWalletTarget,
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

/**
 * A location record of account `did` as a place. Some records keep their
 * coordinates in a blob on the account's server. The short name comes from
 * the point ("Corvallis, United States"), as the record's own name is free
 * text; without one, its last two parts.
 */
async function placeOf(record: Parameters<typeof toPlace>[0], did: string): Promise<Place | null> {
  const cid = locationBlobCid(record);
  const place = toPlace(record, cid ? await getBlobText(did, cid) : null);
  const label = place?.point ? await getPlaceLabel(place.point) : null;
  return place && label ? { ...place, short: label } : place;
}

/**
 * An account as the API has it: its profile and organization records, read
 * in one or two API calls, with `handle` and `place` still null. Those two
 * need lookups outside the API (the handle checked against its DID document
 * and domain, the place's name from a geocoder), which can take a second;
 * pages show this first and stream them in (getActor, getHandle,
 * getActorPlace).
 */
export async function getActorCore(actor: string): Promise<ActorDetail | null> {
  "use cache";
  // Anything else in the URL (a stray /favicon.png, a probe) is no account:
  // answered without an API call or cache tag pollution.
  if (!isDidParam(actor) && !l.isHandleString(actor)) return null;
  publicData(tags.actor(actor));

  // getProfile accepts a handle or DID; getOrganization needs the DID and
  // fails for accounts without an organization record (people). An
  // organization can exist without a profile, so a DID gets the organization
  // lookup either way. Given a DID, both lookups run at once; given a
  // handle, the profile names the DID first.
  const organizationOf = (did: Did) =>
    api.xrpcSafe(app.certified.actor.getOrganization, { params: { actor: did }, ...read() });
  const isDid = actor.startsWith("did:");
  const byDid = isDid ? organizationOf(actor as Did) : null;
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
  const organization = await (byDid ?? organizationOf(did));

  if (organization.success) return toActorDetail(organization.body.actor);
  if (!notFound(organization)) throw organization;
  if (profile.success) {
    return toActorDetail({ did, profile: profile.body.profile, organization: null });
  }
  // No Certified records at all: the account all the same (shown by its
  // handle, nameOf), so links from followers and endorsements don't lead to
  // "not found".
  return toActorDetail({ did, profile: null, organization: null });
}

/**
 * Where an organization is, as a place with a short name: its location
 * record (the organization view carries it), coordinates from a blob when the
 * record keeps them there, and the name from the geocoder.
 */
export async function getActorPlace(did: string): Promise<Place | null> {
  "use cache";
  publicData(tags.actor(did));
  const organization = await api.xrpcSafe(app.certified.actor.getOrganization, {
    params: { actor: did as Did },
    ...read(),
  });
  if (!organization.success) {
    if (notFound(organization)) return null;
    throw organization;
  }
  const record = organization.body.actor.location?.record;
  return record ? placeOf(record, did) : null;
}

/**
 * The account in full: getActorCore with its verified handle and its place.
 * Not cached itself: its parts are, and a handle check that failed for a
 * moment (null here) must not be kept for an hour.
 */
export async function getActor(actor: string): Promise<ActorDetail | null> {
  const core = await getActorCore(actor);
  if (!core) return null;
  // Both outside the API, and independent: at once.
  const [handle, place] = await Promise.all([
    getHandle(core.did),
    core.isOrganization ? getActorPlace(core.did) : null,
  ]);
  return { ...core, handle, place };
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

/**
 * The project as the API has it: its author's card without a handle (the
 * handle needs outside lookups). A project's page shows this first.
 */
export async function getProjectRecord(uri: string): Promise<ProjectDetail | null> {
  "use cache";
  publicData(tags.project(uri));

  const result = await api.xrpcSafe(org.hypercerts.collection.getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (result.success) return toProjectDetail(result.body.collection);
  if (notFound(result)) return null;
  throw result;
}

/** The project with its author's verified handle. */
export async function getProject(uri: string): Promise<ProjectDetail | null> {
  "use cache";
  publicData(tags.project(uri));
  const project = await getProjectRecord(uri);
  if (!project) return null;
  const [withHandle] = await withHandlesIn([project], "author");
  return withHandle;
}

/**
 * The DID a route's account segment names: itself when it is one; for a
 * handle, from the API's profile lookup (getActorCore), without checking the
 * handle both ways. For record pages, whose records are found by DID.
 */
export async function didOfSegment(segment: string): Promise<string | null> {
  if (isDidParam(segment)) return segment;
  return (await getActorCore(segment))?.did ?? null;
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
export async function listLatestRecords(did: string, limit: number): Promise<LatestRecord[]> {
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
  const latest: LatestRecord[] = [
    ...activities.map((view) => ({
      kind: "activity" as const,
      activity: toActivityCard(view),
      createdAt: view.record.createdAt,
    })),
    ...collections.map((view) => ({
      kind: "project" as const,
      project: toProjectCard(view),
      createdAt: view.record.createdAt,
    })),
  ];
  return latest
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
  const pages = await Promise.all(
    chunks(foreign).map((batch) =>
      api.call(org.hypercerts.claim.listActivities, { uris: batch as AtUri[], limit: 100 }, read()),
    ),
  );
  const others = pages.flatMap((page) => page.activities.map(toActivityCard));

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

/**
 * Every plain endorsement ("Endorsement" badge of type "endorsement") that
 * `actor` gave `subject` in the index. Never cached: the write action asks it
 * before creating or revoking, and waits on it after.
 */
export async function getIndexedEndorsements(
  actor: string,
  subject: string,
): Promise<EndorsementRef[]> {
  const refs: EndorsementRef[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const out = await api.call(
      app.certified.badge.listBadgeAwards,
      {
        authors: [actor as Did],
        subjects: [subject],
        badgeTypes: [ENDORSEMENT_BADGE_TYPE],
        limit: 100,
        cursor,
      },
      read(),
    );
    for (const award of out.badgeAwards) {
      if (toEndorsementCard(award).badge !== PLAIN_ENDORSEMENT) continue;
      refs.push({ uri: award.uri, cid: award.cid });
    }
    if (!out.cursor || out.cursor === cursor) break;
    cursor = out.cursor;
  }
  return refs;
}

/**
 * The index's plain endorsement of `subject` by `actor`, or null. Never
 * cached: the write action asks it whether the index has caught up.
 */
export async function getIndexedEndorsement(
  actor: string,
  subject: string,
): Promise<EndorsementRef | null> {
  return (await getIndexedEndorsements(actor, subject))[0] ?? null;
}

/** {@link getIndexedEndorsement}, cached with the actor's endorsements. */
export async function getEndorsement(
  actor: string,
  subject: string,
): Promise<EndorsementRef | null> {
  "use cache";
  publicData(tags.endorsements(actor));
  return getIndexedEndorsement(actor, subject);
}

/**
 * The index's follow of `subject` by `actor` (the earliest, if there are
 * duplicates), or null. Never cached: the write overlay asks it whether the
 * index has caught up with a follow or an unfollow.
 */
export async function getIndexedFollow(actor: string, subject: string): Promise<FollowRef | null> {
  const { follow } = await api.call(
    app.certified.graph.getFollow,
    { actor: actor as Did, subject: subject as Did },
    read(),
  );
  return follow ? { uri: follow.uri, cid: follow.cid } : null;
}

/** {@link getIndexedFollow}, cached with the actor's follows. */
export async function getFollow(actor: string, subject: string): Promise<FollowRef | null> {
  "use cache";
  publicData(tags.follows(actor));
  return getIndexedFollow(actor, subject);
}

/**
 * The index's follow of record `entity` (a project) by `actor`, or null.
 * Never cached, like {@link getIndexedFollow}.
 */
export async function getIndexedEntityFollow(
  actor: string,
  entity: string,
): Promise<FollowRef | null> {
  const { follow } = await api.call(
    app.certified.graph.getEntityFollow,
    { actor: actor as Did, entity: entity as AtUri },
    read(),
  );
  return follow ? { uri: follow.uri, cid: follow.cid } : null;
}

/** {@link getIndexedEntityFollow}, cached with the actor's follows. */
export async function getEntityFollow(actor: string, entity: string): Promise<FollowRef | null> {
  "use cache";
  publicData(tags.follows(actor));
  return getIndexedEntityFollow(actor, entity);
}

/**
 * How many follow `did`, and how many it follows: accounts and projects
 * together (`following`), and each kind on its own.
 */
export type FollowCounts = {
  followers: number;
  following: number;
  followingAccounts: number;
  followingProjects: number;
  /** More projects are followed than were counted (ProjectsFollowed's cap). */
  followingMore: boolean;
};

export async function getFollowCounts(did: string): Promise<FollowCounts> {
  "use cache";
  publicData(tags.follows(did));

  const [followers, following, projects] = await Promise.all([
    api.call(app.certified.graph.listActorFollowers, { actor: did as Did, limit: 1 }, read()),
    api.call(app.certified.graph.listActorFollowing, { actor: did as Did, limit: 1 }, read()),
    projectsFollowed(did),
  ]);
  return {
    followers: followers.totalCount,
    following: following.totalCount + projects.rows.length,
    followingAccounts: following.totalCount,
    followingProjects: projects.rows.length,
    followingMore: projects.more,
  };
}

/** A project an account follows, with the follow record that unfollowing deletes. */
export type ProjectFollowRow = { follow: FollowRef; project: ProjectCard; author: ActorCard };

/** Followed projects read, at most: the API gives no total for entity follows (TECH-944). */
const PROJECTS_FOLLOWED_CAP = 500;

/**
 * The projects `did` follows (entity follows of org.hypercerts.collection),
 * newest first. The API has no total for these, so they are read in pages up
 * to PROJECTS_FOLLOWED_CAP; `more` says there are more than that.
 */
export async function listProjectsFollowed(
  did: string,
): Promise<{ rows: ProjectFollowRow[]; more: boolean }> {
  "use cache";
  publicData(tags.follows(did));
  const { rows, more } = await projectsFollowed(did);
  return { rows: await withHandlesIn(rows, "author"), more };
}

/** The same, the authors without handles: for counting, which needs none. */
async function projectsFollowed(did: string): Promise<{ rows: ProjectFollowRow[]; more: boolean }> {
  "use cache";
  publicData(tags.follows(did));

  const rows: ProjectFollowRow[] = [];
  let cursor: string | undefined;
  do {
    const out = await api.call(
      app.certified.graph.listEntityFollowing,
      { actor: did as Did, limit: 100, cursor },
      read(),
    );
    for (const item of out.entities) {
      // Null when the followed project is gone (deleted, or not indexed): skip it.
      const entity = item.entity as ({ $type?: string } & CollectionViewLike) | null;
      if (entity?.$type !== "org.hypercerts.collection.getCollection#collectionView") continue;
      const view = entity as unknown as Parameters<typeof toProjectDetail>[0];
      rows.push({
        follow: { uri: item.follow.uri, cid: item.follow.cid },
        project: toProjectCard(view),
        author: toActorCard(view.author),
      });
    }
    cursor = out.cursor ?? undefined;
  } while (cursor && rows.length < PROJECTS_FOLLOWED_CAP);
  return { rows, more: Boolean(cursor) };
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
  const page = await endorsementPage(did, direction, withHidden);
  return direction === "given" ? page : { ...page, rows: await withHandlesIn(page.rows, "actor") };
}

/** The same, received endorsers without handles: for the header, which links none of them. */
async function endorsementPage(
  did: string,
  direction: "received" | "given",
  withHidden: boolean,
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
  return { rows, more: Boolean(cursor) };
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

  const { rows, more } = await endorsementPage(did, "received", false);
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

/** The badges awarded to record `uri` (a project, an activity), not rejected: in force first, then newest. */
export async function getRecordBadges(uri: string): Promise<BadgeCard[]> {
  "use cache";
  publicData(tags.badges(uri));

  const { badgeAwards } = await api.call(
    app.certified.badge.listBadgeAwards,
    { subjects: [uri], responses: ["accepted", "unanswered"], limit: 100 },
    read(),
  );
  return sortBadges(
    await withHandlesIn(
      badgeAwards.flatMap((award) => toBadgeCard(award) ?? []),
      "issuer",
    ),
  );
}

/** A badge awarded to one of an account's projects, with that project. */
export type ProjectBadge = BadgeCard & { project: ProjectCard };

/** Pages of an account's projects read for their badges, a hundred each. */
const PROJECT_BADGE_PAGES = 3;

/**
 * The badges awarded to `did`'s projects (not rejected), in force first, then
 * newest: its projects a hundred a call, then their awards a hundred
 * projects a call.
 */
export async function getProjectBadges(
  did: string,
): Promise<{ badges: ProjectBadge[]; more: boolean }> {
  "use cache";
  publicData(tags.badges(did));
  cacheTag(tags.projects(did));

  const projects = new Map<string, ProjectCard>();
  let cursor: string | undefined;
  let more = false;
  for (let page = 0; page < PROJECT_BADGE_PAGES; page++) {
    const out = await api.call(
      org.hypercerts.collection.listCollections,
      { authors: [did as Did], types: ["project"], limit: 100, cursor },
      read(),
    );
    for (const view of out.collections) projects.set(view.uri, toProjectCard(view));
    cursor = out.cursor;
    more = Boolean(cursor);
    if (!cursor) break;
  }
  const awards = (
    await Promise.all(
      chunks([...projects.keys()]).map(async (batch) => {
        const out = await api.call(
          app.certified.badge.listBadgeAwards,
          { subjects: batch, responses: ["accepted", "unanswered"], limit: 100 },
          read(),
        );
        if (out.cursor) more = true;
        return out.badgeAwards;
      }),
    )
  ).flat();
  const badges = awards.flatMap((award): ProjectBadge[] => {
    const card = toBadgeCard(award);
    const project = projects.get(awardSubject(award.record.subject) ?? "");
    return card && project ? [{ ...card, project }] : [];
  });
  return { badges: sortBadges(await withHandlesIn(badges, "issuer")), more };
}

/** Who a badge went to: an account, or a record (a project, an activity). */
export type BadgeRecipient =
  | { kind: "account"; actor: ActorCard }
  | { kind: "record"; title: string; href: string };

/** A badge an account awarded, with who it went to and their response. */
export type AwardedBadge = BadgeCard & { recipient: BadgeRecipient };

/**
 * The badges `did` awarded to others, newest first, whatever the recipient
 * answered (BadgeCard.status). Plain endorsements are left out: the
 * workspace's Endorsements list them. Each badge's page tag is on the entry
 * too, so a recipient's answer (which refreshes that tag) shows here.
 */
export async function getAwardedBadges(
  did: string,
): Promise<{ badges: AwardedBadge[]; more: boolean }> {
  "use cache";
  publicData(tags.badges(did));

  const awards: BadgeAwardView[] = [];
  let cursor: string | undefined;
  let more = false;
  for (let page = 0; page < BADGE_PAGES; page++) {
    const out = await api.call(
      app.certified.badge.listBadgeAwards,
      {
        authors: [did as Did],
        responses: ["unanswered", "accepted", "rejected"],
        limit: 100,
        cursor,
      },
      read(),
    );
    awards.push(...out.badgeAwards);
    cursor = out.cursor;
    more = Boolean(cursor);
    if (!cursor) break;
  }
  const cards = awards.flatMap((award) => {
    const card = toBadgeCard(award, Date.now(), { withRejected: true });
    const subject = awardSubject(award.record.subject);
    return card && subject ? [{ card, subject }] : [];
  });
  for (const { card } of cards) {
    cacheTag(tags.badge(`at://${card.ownerDid}/app.certified.badge.definition/${card.rkey}`));
  }
  const dids = [
    ...new Set(cards.flatMap(({ subject }) => (subject.startsWith("did:") ? subject : []))),
  ];
  const recordUris = [
    ...new Set(cards.flatMap(({ subject }) => (subject.startsWith("at://") ? subject : []))),
  ];
  const [actors, records] = await Promise.all([
    actorCards(dids),
    recordUris.length > 0 ? resolveListItems(recordUris) : [],
  ]);
  const recordsByUri = new Map(records.map((item) => [item.uri, item]));
  const recipientOf = (subject: string): BadgeRecipient | null => {
    const actor = actors.get(subject);
    if (actor) return { kind: "account", actor };
    const item = recordsByUri.get(subject);
    if (item?.kind === "project") {
      return { kind: "record", title: item.project.title, href: projectHrefOf(item.project) };
    }
    if (item?.kind === "activity") {
      return { kind: "record", title: item.activity.title, href: activityHrefOf(item.uri) };
    }
    return null;
  };
  const badges = cards.flatMap(({ card, subject }): AwardedBadge[] => {
    const recipient = recipientOf(subject);
    return recipient ? [{ ...card, recipient }] : [];
  });
  return { badges: badges.sort((a, b) => b.time - a.time), more };
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
          ...(badge.allowedIssuers.length > 0 && {
            authors: badge.allowedIssuers as Did[],
          }),
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

/**
 * The badges `did` created for awarding, as its workspace lists them: its
 * issued badges without its plain Endorsement, which Endorsements gives.
 */
export async function getYourBadges(did: string): Promise<IssuedBadge[]> {
  const { badges } = await getIssuedBadges(did);
  return badges.filter(
    (badge) =>
      !(badge.title === PLAIN_ENDORSEMENT && badge.type?.toLowerCase() === ENDORSEMENT_BADGE_TYPE),
  );
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

/** Whether badge definition `uri` is in the index. Never cached (waitForIndex). */
export async function badgeDefinitionIndexed(uri: string): Promise<boolean> {
  const result = await api.xrpcSafe(app.certified.badge.getBadgeDefinition, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  return result.success;
}

/** Whether badge award `uri` is in the index. Never cached (waitForIndex). */
export async function badgeAwardIndexed(uri: string): Promise<boolean> {
  const result = await api.xrpcSafe(app.certified.badge.getBadgeAward, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  return result.success;
}

/**
 * The indexed response status of badge award `uri` ("accepted", "rejected",
 * or "unanswered"), or null when the award isn't in the index. Never cached.
 */
export async function getIndexedBadgeAwardResponse(
  uri: string,
): Promise<"accepted" | "rejected" | "unanswered" | null> {
  const result = await api.xrpcSafe(app.certified.badge.getBadgeAward, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) return null;
  const status = result.body.badgeAward.responseStatus;
  if (status === "accepted" || status === "rejected" || status === "unanswered") return status;
  return null;
}

/**
 * A badge's holder: an account (a person row, with the award's note), or a
 * record the badge went to, a project or an activity (as a list item,
 * resolveListItems), with the award's date.
 */
export type BadgeHolder =
  | { kind: "account"; uri: string; row: PersonRow }
  | {
      kind: "record";
      uri: string;
      item: Extract<ListItem, { kind: "project" | "activity" }>;
      date: string | null;
    };

/** One page of a badge's holders, newest award first. */
export type BadgeHolders = Page<BadgeHolder> & {
  /** Every award with this response, as the API counts them. */
  total: number;
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
      ...(allowedIssuers.length > 0 && { authors: allowedIssuers as Did[] }),
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
  const subjects = awards.flatMap((award) => awardSubject(award.record.subject) ?? []);
  const dids = [...new Set(subjects.filter((subject) => subject.startsWith("did:")))];
  const recordUris = [...new Set(subjects.filter((subject) => subject.startsWith("at://")))];
  const [cards, records] = await Promise.all([
    actorCards(dids),
    recordUris.length > 0 ? resolveListItems(recordUris) : [],
  ]);
  const recordsByUri = new Map(records.map((item) => [item.uri, item]));
  const holders: BadgeHolder[] = [];
  for (const award of awards) {
    const subject = awardSubject(award.record.subject);
    if (!subject) continue;
    const { note, createdAt } = toEndorsementCard(award); // an award's note and date
    const actor = cards.get(subject);
    if (actor) {
      holders.push({
        kind: "account",
        uri: award.uri,
        row: { uri: award.uri, actor, note, date: createdAt },
      });
      continue;
    }
    const item = recordsByUri.get(subject);
    if (item?.kind === "project" || item?.kind === "activity") {
      holders.push({ kind: "record", uri: award.uri, item, date: createdAt });
    }
  }
  return {
    items: holders,
    cursor: out.cursor ?? null,
    total: totalCount ?? holders.length,
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
    follow: { uri: view.follow.uri, cid: view.follow.cid },
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

/**
 * The index's current CID and item URIs for collection `uri`, or null when
 * absent. Never cached: list actions wait on it before expiring cache tags.
 */
export async function getIndexedList(
  uri: string,
): Promise<{ cid: string; itemUris: string[] } | null> {
  const result = await api.xrpcSafe(org.hypercerts.collection.getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) return null;
  const { cid, record } = result.body.collection;
  const itemUris = (record.items ?? []).flatMap((item) => item.itemIdentifier?.uri ?? []);
  return { cid, itemUris };
}

const REACTION_BATCH = 50;

async function cachedLikeCounts(unique: string[]): Promise<Record<string, number>> {
  "use cache";
  cacheLife("public");
  for (const uri of unique) cacheTag(tags.likes(uri));

  const counts: Record<string, number> = {};
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += REACTION_BATCH) {
    batches.push(unique.slice(i, i + REACTION_BATCH));
  }
  await Promise.all(
    batches.map(async (batch) => {
      const res = await api.call(
        app.certified.feed.getReactionCounts,
        { subjects: batch as AtUri[] },
        read(),
      );
      for (const item of res.counts) {
        counts[item.subject] = item.likeCount;
      }
    }),
  );
  return counts;
}

/**
 * Cached like counts for up to many record AT-URIs, batched via
 * `app.certified.feed.getReactionCounts`. Errors throw out of `"use cache"`
 * (so outages are never cached) and degrade to empty counts here.
 */
export async function getLikeCounts(subjects: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(subjects)].filter(Boolean).sort();
  if (unique.length === 0) return {};
  try {
    return await cachedLikeCounts(unique);
  } catch (err) {
    logError("[likes] getReactionCounts failed", err, { count: unique.length });
    return {};
  }
}

async function cachedActorLikesForSubjects(
  actor: string,
  unique: string[],
): Promise<Record<string, string | null>> {
  "use cache";
  cacheLife("public");
  cacheTag(tags.actorLikes(actor));

  const likes: Record<string, string | null> = {};
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += REACTION_BATCH) {
    batches.push(unique.slice(i, i + REACTION_BATCH));
  }
  await Promise.all(
    batches.map(async (batch) => {
      const res = await api.call(
        app.certified.feed.getActorReactions,
        { actor: actor as Did, subjects: batch as AtUri[] },
        read(),
      );
      for (const row of res.results) {
        likes[row.subject] = row.like?.uri ?? null;
      }
    }),
  );
  return likes;
}

/**
 * Cached check of which `subjects` `actor` has liked, returning a map of
 * subject AT-URI -> like record AT-URI (or null). Errors never populate cache.
 */
export async function getActorLikesForSubjects(
  actor: string,
  subjects: string[],
): Promise<Record<string, string | null>> {
  const unique = [...new Set(subjects)].filter(Boolean).sort();
  if (unique.length === 0) return {};
  try {
    return await cachedActorLikesForSubjects(actor, unique);
  } catch (err) {
    logError("[likes] getActorReactions failed", err, { actor, count: unique.length });
    return {};
  }
}

/** Uncached check of whether `actor` currently likes `subject` in the index. */
export async function getIndexedActorLike(
  actor: string,
  subject: string,
): Promise<{ uri: string; cid: string } | null> {
  const result = await api.xrpcSafe(app.certified.feed.getActorReactions, {
    params: { actor: actor as Did, subjects: [subject as AtUri] },
    ...read(),
  });
  if (!result.success) return null;
  const hit = result.body.results[0]?.like;
  return hit ? { uri: hit.uri, cid: hit.cid } : null;
}

/**
 * Uncached read of `did`'s lists of collection `type` (e.g. `list:accounts`),
 * with each list's item URIs, for the Add-to-list modal.
 */
export async function getIndexedListsByType(
  did: string,
  type: string,
): Promise<{ uri: string; rkey: string; title: string; itemCount: number; itemUris: string[] }[]> {
  const { collections } = await api.call(
    org.hypercerts.collection.listCollections,
    { authors: [did as Did], types: [type], limit: PEOPLE_PAGE },
    read(),
  );
  return collections.map((collection) => {
    const itemUris = (collection.record.items ?? []).flatMap(
      (item) => item.itemIdentifier?.uri ?? [],
    );
    return {
      uri: collection.uri,
      rkey: collection.uri.split("/").pop() ?? "",
      title: collection.record.title || "Untitled list",
      itemCount: itemUris.length,
      itemUris,
    };
  });
}

const collectionOf = (uri: string) => uri.split("/")[3] ?? "";

/**
 * These items resolved, in their order: accounts in one batch, projects and
 * activities a hundred per call, endorsements one call each.
 */
export async function resolveListItems(uris: string[], listUri?: string): Promise<ListItem[]> {
  "use cache";
  cacheLife("public");
  if (listUri) cacheTag(tags.list(listUri));

  const of = (...nsids: string[]) => uris.filter((uri) => nsids.includes(collectionOf(uri)));
  const accountUris = of("app.certified.actor.profile", "app.bsky.actor.profile");
  const projectUris = of("org.hypercerts.collection");
  const activityUris = of("org.hypercerts.claim.activity");
  const awardUris = of("app.certified.badge.award");

  const entityTags = new Set<string>();
  for (const uri of accountUris) entityTags.add(tags.actor(didOf(uri)));
  for (const uri of projectUris) entityTags.add(tags.project(uri));
  for (const uri of activityUris) entityTags.add(tags.activities(didOf(uri)));
  for (const uri of awardUris) entityTags.add(tags.endorsements(didOf(uri)));
  for (const tag of entityTags) cacheTag(tag);

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

  // Every account the items name: listed accounts, project/activity authors,
  // and endorsement issuers + subjects (resolved with handles in one batch).
  const dids = new Set<string>([
    ...accountUris.map(didOf),
    ...[...projects.values()].map((project) => project.authorDid),
    ...[...activities.values()].map((activity) => activity.author.did),
    ...[...awards.values()].flatMap((award) => {
      const subject = awardSubject(award.record.subject);
      return subject?.startsWith("did:") ? [award.author.did, subject] : [award.author.did];
    }),
  ]);
  const actors = await actorCards([...dids]);

  return uris.map((uri): ListItem => {
    const project = projects.get(uri);
    if (project) {
      return { kind: "project", uri, project, author: actors.get(project.authorDid) ?? null };
    }
    const activity = activities.get(uri);
    if (activity) {
      const author = actors.get(activity.author.did);
      return {
        kind: "activity",
        uri,
        activity: author ? { ...activity, author } : activity,
      };
    }
    const award = awards.get(uri);
    if (award) {
      const subject = awardSubject(award.record.subject);
      return {
        kind: "endorsement",
        uri,
        issuer: actors.get(award.author.did) ?? toActorCard(award.author),
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
    items: await resolveListItems(uris, list.uri),
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

/** Whether the index shows project (collection) `uri` yet. Never cached: actions ask it after a write. */
export async function projectIndexed(uri: string): Promise<boolean> {
  const result = await api.xrpcSafe(org.hypercerts.collection.getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (result.success) return true;
  if (notFound(result)) return false;
  throw result;
}

/** Whether the index shows activity `uri` yet. Never cached: actions ask it after a write. */
export async function activityIndexed(uri: string): Promise<boolean> {
  const result = await api.xrpcSafe(org.hypercerts.claim.getActivity, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (result.success) return true;
  if (notFound(result)) return false;
  throw result;
}

/** An activity as its own page shows it: the card, its full text (rich-text) and who did it. */
export type ActivityDetail = ActivityCard & {
  /** Its own short description only (a card's summary falls back to the long text). */
  shortDescription: string | null;
  description: RichText | null;
  contributors: Contributor[];
};

/**
 * The activity as the API has it: its author's and contributors' cards
 * without handles (handles need outside lookups, one account each). An
 * activity's page shows this first.
 */
export async function getActivityRecord(uri: string): Promise<ActivityDetail | null> {
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
  return {
    ...toActivityCard(activity),
    shortDescription: activity.record.shortDescription?.trim() || null,
    description: richTextOf(activity.record.description),
    contributors: toContributors(activity.contributors),
  };
}

/** The activity with its author's and contributors' verified handles, for links. */
export async function getActivity(uri: string): Promise<ActivityDetail | null> {
  "use cache";
  publicData(tags.activities(didOf(uri)));
  const activity = await getActivityRecord(uri);
  if (!activity) return null;
  const { contributors } = activity;
  const [[card], actors] = await Promise.all([
    withHandlesIn([activity], "author"),
    withHandles(contributors.flatMap((c) => (c.actor ? [c.actor] : []))),
  ]);
  // The accounts, with their handles for links, back in their places.
  let next = 0;
  return {
    ...card,
    contributors: contributors.map((c) => (c.actor ? { ...c, actor: actors[next++] } : c)),
  };
}

// What others add to an activity or a project
//
// Evaluations, measurements and attachments (updates among them) name the
// records they are about; each kind is one call filtered by the record, so a
// page asks for its own and shows each section as it arrives. All public,
// cached with the record's context (tags.context).

/** The address files are served from on an account's server, or null if it can't be found. */
async function blobBase(did: string): Promise<string | null> {
  try {
    const url = new URL("/xrpc/com.atproto.sync.getBlob", await getPdsUrl(did));
    return url.protocol === "https:" ? url.href : null;
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/** Each DID's blob address, looked up once per account. */
async function blobBases(dids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(dids)];
  return new Map(await Promise.all(unique.map(async (did) => [did, await blobBase(did)] as const)));
}

/** An evaluation, with its evaluators' cards (those the API knows). */
export type EvaluationWithEvaluators = Evaluation & { evaluators: ActorCard[] };

/** Context records are read for up to this many records at once (the API's limit). */
const SUBJECTS = 100;

/** One record's URI, or several's (a project and its activities), as the API's subjects. */
function subjectsFor(uri: string | string[]): AtUri[] {
  const uris = (Array.isArray(uri) ? uri : [uri]).slice(0, SUBJECTS);
  for (const subject of uris) cacheTag(tags.context(subject));
  return uris as AtUri[];
}

/** The evaluations of record `uri` (or of several records), newest first. */
export async function getEvaluations(uri: string | string[]): Promise<EvaluationWithEvaluators[]> {
  "use cache";
  cacheLife("public");

  const { evaluations } = await api.call(
    org.hypercerts.context.listEvaluations,
    { subjects: subjectsFor(uri), sortDirection: "desc", limit: 50 },
    read(),
  );
  const bases = await blobBases(evaluations.map((view) => view.did));
  const items = evaluations.map((view) => toEvaluation(view, bases.get(view.did) ?? null));
  const cards = new Map(
    (await getActorCards([...new Set(items.flatMap((item) => item.evaluatorDids))])).map((card) => [
      card.did,
      card,
    ]),
  );
  return items.map((item) => ({
    ...item,
    evaluators: item.evaluatorDids.flatMap((did) => cards.get(did) ?? []),
  }));
}

/** The measurements of record `uri` (or of several records), newest first. */
export async function getMeasurements(uri: string | string[]): Promise<Measurement[]> {
  "use cache";
  cacheLife("public");

  const { measurements } = await api.call(
    org.hypercerts.context.listMeasurements,
    { subjects: subjectsFor(uri), sortDirection: "desc", limit: 50 },
    read(),
  );
  return withHandlesIn(
    measurements.map(toMeasurement).filter((m) => m.metric && m.value),
    "author",
  );
}

/**
 * Record `uri`'s attachments (or several records'): its updates (newest
 * first), and the rest. Comments are left out.
 */
export async function getAttachments(
  uri: string | string[],
): Promise<{ updates: Attachment[]; files: Attachment[] }> {
  "use cache";
  cacheLife("public");

  const { attachments } = await api.call(
    org.hypercerts.context.listAttachments,
    { subjects: subjectsFor(uri), sortDirection: "desc", limit: 100 },
    read(),
  );
  const bases = await blobBases(attachments.map((view) => view.did));
  const items = await withHandlesIn(
    attachments.map((view) => toAttachment(view, bases.get(view.did) ?? null)),
    "author",
  );
  return {
    updates: items.filter((item) => item.kind === "update"),
    files: items.filter((item) => item.kind !== "update" && item.kind !== "comment"),
  };
}

// Timeline
//
// What happened in a project or an activity, newest first: a project's
// activities as they were published; what was added to the record (and to a
// project's activities): updates, other attachments, evaluations,
// measurements, badges; and the gifts it received, a day's together, as an
// account's feed groups them. Each kind is read once for the record and its
// activities together.

/** The activity a timeline item is about, when it isn't the project itself. */
export type TimelineOn = FeedLink | null;

export type TimelineItem = { key: string; time: number } & (
  | { kind: "activity"; activity: ActivityCard }
  | { kind: "update"; update: Attachment; on: TimelineOn }
  | { kind: "attachment"; attachment: Attachment; on: TimelineOn }
  | { kind: "evaluation"; evaluation: EvaluationWithEvaluators; on: TimelineOn }
  | { kind: "measurement"; measurement: Measurement; on: TimelineOn }
  | { kind: "badge"; badge: BadgeCard; on: TimelineOn }
  | { kind: "gifts"; row: Extract<FeedRow, { kind: "gifts" }> }
);

/** A project's or an activity's timeline, newest first. */
export async function getTimeline(uri: string): Promise<TimelineItem[]> {
  "use cache";
  publicData(tags.project(uri));
  cacheTag(tags.badges(uri));
  cacheTag(tags.activities(didOf(uri)));

  const isProject = collectionOf(uri) === "org.hypercerts.collection";
  const project = isProject ? await getProject(uri) : null;
  if (isProject && !project) return [];
  const activityUris = project?.activityUris ?? [];
  const subjects = [uri, ...activityUris].slice(0, SUBJECTS) as AtUri[];

  const [activityViews, evaluations, measurements, attachments, awards, receipts] =
    await Promise.all([
      Promise.all(
        chunks(activityUris).map(
          async (batch) =>
            (
              await api.call(
                org.hypercerts.claim.listActivities,
                { uris: batch as AtUri[], limit: 100 },
                read(),
              )
            ).activities,
        ),
      ).then((pages) => pages.flat()),
      getEvaluations(subjects),
      getMeasurements(subjects),
      getAttachments(subjects),
      api
        .call(
          app.certified.badge.listBadgeAwards,
          { subjects, responses: ["accepted", "unanswered"], limit: 100 },
          read(),
        )
        .then((out) => out.badgeAwards),
      api
        .call(org.hypercerts.funding.listReceipts, { forUris: [uri as AtUri], limit: 100 }, read())
        .then((out) => out.receipts),
    ]);
  cacheTag(tags.funding(uri));

  // Gifts as the account feed shows them: a day's in one post, naming donors.
  const gifts = receipts.map((view) => giftEvent(view, "received"));
  const donors = new Map(
    (
      await getActorCards([
        ...new Set(gifts.flatMap((gift) => (gift.counterpart ? [gift.counterpart] : []))),
      ])
    ).map((card) => [card.did, card]),
  );
  const giftTimes = new Map(gifts.map((gift) => [gift.key, gift.time]));
  const giftRows = (await withFeedHandles(groupFeed(gifts, donors, new Map()))).flatMap((row) =>
    row.kind === "gifts" ? [row] : [],
  );

  const activities = await withHandlesIn(activityViews.map(toActivityCard), "author");
  const activityLinks = new Map(
    activities.map((activity) => [
      activity.uri,
      { title: activity.title, href: activityHrefOf(activity.uri) },
    ]),
  );
  // The activity it is about, unless it is (also) about the project.
  const on = (about: string[]): TimelineOn =>
    about.includes(uri)
      ? null
      : (about.map((subject) => activityLinks.get(subject)).find(Boolean) ?? null);
  const created = new Map<string, number>(
    activityViews.map((view) => [
      view.uri,
      new Date(String(view.record.createdAt ?? "")).getTime(),
    ]),
  );

  const badges = await withHandlesIn(
    awards.flatMap((award) => {
      const card = toBadgeCard(award);
      const subject = awardSubject(award.record.subject);
      return card && subject ? [{ ...card, subject }] : [];
    }),
    "issuer",
  );

  const items: TimelineItem[] = [
    ...activities.map((activity) => ({
      kind: "activity" as const,
      key: activity.uri,
      time: created.get(activity.uri) || 0,
      activity,
    })),
    ...attachments.updates.map((update) => ({
      kind: "update" as const,
      key: update.uri,
      time: update.time,
      update,
      on: on(update.subjects),
    })),
    ...attachments.files.map((attachment) => ({
      kind: "attachment" as const,
      key: attachment.uri,
      time: attachment.time,
      attachment,
      on: on(attachment.subjects),
    })),
    ...evaluations.map((evaluation) => ({
      kind: "evaluation" as const,
      key: evaluation.uri,
      time: evaluation.time,
      evaluation,
      on: on(evaluation.subjects),
    })),
    ...measurements.map((measurement) => ({
      kind: "measurement" as const,
      key: measurement.uri,
      time: measurement.time,
      measurement,
      on: on(measurement.subjects),
    })),
    ...giftRows.map((row) => ({
      kind: "gifts" as const,
      key: row.key,
      time: giftTimes.get(row.key) ?? 0,
      row,
    })),
    ...badges.map(({ subject, ...badge }) => ({
      kind: "badge" as const,
      key: badge.uri,
      time: badge.time,
      badge,
      on: on([subject]),
    })),
  ];
  return items.sort((a, b) => b.time - a.time);
}

/** The projects holding activity `uri`, any author's. */
export async function getProjectsWith(uri: string): Promise<ProjectCard[]> {
  "use cache";
  publicData(tags.context(uri));
  cacheTag(tags.activities(didOf(uri)));

  const { collections } = await api.call(
    org.hypercerts.collection.listCollections,
    { itemUris: [uri as AtUri], types: ["project"], limit: 20 },
    read(),
  );
  return collections.map(toProjectCard);
}

/** A location record (app.certified.location) as a place, with a short name from its point. */
export async function getPlace(uri: string): Promise<Place | null> {
  "use cache";
  publicData(tags.context(uri));

  const result = await api.xrpcSafe(app.certified.location.getLocation, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  if (!result.success) {
    if (notFound(result)) return null;
    throw result;
  }
  return placeOf(result.body.location.record, didOf(uri));
}

/** A location an account published, to pick again: its record, its name, its point. */
export type SavedPlace = { uri: string; name: string; point: { lat: number; lng: number } | null };

/**
 * The places account `did` published (app.certified.location), by name, each
 * name and point once: many accounts wrote the same place more than once.
 */
export async function listSavedPlaces(did: string): Promise<SavedPlace[]> {
  "use cache";
  publicData(tags.locations(did));

  const { locations } = await api.call(
    app.certified.location.listLocations,
    { authors: [did as Did], limit: 100 },
    read(),
  );
  const places = await Promise.all(
    locations.map(async (view): Promise<SavedPlace | null> => {
      const cid = locationBlobCid(view.record);
      const place = toPlace(view.record, cid ? await getBlobText(did, cid) : null);
      return place ? { uri: view.uri, name: place.name, point: place.point } : null;
    }),
  );
  const seen = new Set<string>();
  return places
    .filter((place): place is SavedPlace => {
      if (!place) return false;
      const key = `${place.name.toLowerCase()}|${place.point?.lat ?? ""}|${place.point?.lng ?? ""}`;
      return !seen.has(key) && Boolean(seen.add(key));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Explore
//
// The network's activities, projects and accounts, newest or oldest first,
// listed or searched; and Featured, the projects in Ma Earth's Funding Round 3.

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
type ActorCardInput = org.hypercerts.api.defs.ActorView;

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
 * Featured: the projects in Ma Earth's Funding Round 3, as Ma Earth's own
 * account marked them (its "Ma Earth Round 3" badge, awarded to each project),
 * with their activities and the organizations behind them.
 */
const FEATURED_BADGE =
  "at://did:plc:7ffezlhobzihdt3nbazysgvr/app.certified.badge.definition/3mxttbmcbgc2e";
/** Pages of awards read, a hundred each: the round has about 200. */
const FEATURED_PAGES = 5;

/** The projects the featured badge was awarded to (not rejected), each once. */
async function featuredProjectUris(): Promise<string[]> {
  const uris = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < FEATURED_PAGES; page++) {
    const out = await api.call(
      app.certified.badge.listBadgeAwards,
      {
        badgeUris: [FEATURED_BADGE as AtUri],
        authors: [didOf(FEATURED_BADGE) as Did],
        responses: ["accepted", "unanswered"],
        limit: 100,
        cursor,
      },
      read(),
    );
    for (const award of out.badgeAwards) {
      const subject = awardSubject(award.record.subject);
      if (subject && collectionOf(subject) === "org.hypercerts.collection") uris.add(subject);
    }
    cursor = out.cursor;
    if (!cursor) break;
  }
  return [...uris];
}

const byCreated = <T extends { uri: string; record: { createdAt?: unknown } }>(views: T[]) =>
  [...views]
    .sort((a, b) =>
      String(b.record.createdAt ?? "").localeCompare(String(a.record.createdAt ?? "")),
    )
    .map((view) => view.uri);

/**
 * The featured records of one kind, by URI (accounts by DID), each once and
 * newest first: projects and activities by their own createdAt, accounts by
 * their newest featured project.
 */
async function featuredUris(kind: FeaturedKind): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.badge(FEATURED_BADGE));
  const projectUris = await featuredProjectUris();
  const projects = (
    await Promise.all(
      chunks(projectUris).map(
        async (batch) =>
          (
            await api.call(
              org.hypercerts.collection.listCollections,
              { uris: batch as AtUri[], limit: 100 },
              read(),
            )
          ).collections,
      ),
    )
  ).flat();
  const newestProjects = byCreated(projects);
  if (kind === "projects") return newestProjects;
  if (kind === "accounts") return [...new Set(newestProjects.map(didOf))];
  const activityUris = [
    ...new Set(
      projects.flatMap((project) =>
        (project.record.items ?? [])
          .map((item) => item.itemIdentifier.uri)
          .filter((uri) => collectionOf(uri) === "org.hypercerts.claim.activity"),
      ),
    ),
  ];
  const activities = (
    await Promise.all(
      chunks(activityUris).map(
        async (batch) =>
          (
            await api.call(
              org.hypercerts.claim.listActivities,
              { uris: batch as AtUri[], limit: 100 },
              read(),
            )
          ).activities,
      ),
    )
  ).flat();
  return byCreated(activities);
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
    const cards = await getActorCards(uris);
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
          // Null when the followed project is gone (deleted, or not indexed): skip it.
          const entity = item.entity as ({ $type?: string } & CollectionViewLike) | null;
          if (entity?.$type !== "org.hypercerts.collection.getCollection#collectionView") {
            return [];
          }
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
        events: out.receipts.map((view) => giftEvent(view, direction)),
        cursor: out.cursor ?? null,
      };
    }
  }
}
type CollectionViewLike = Record<string, unknown>;

type ReceiptView = org.hypercerts.funding.listReceipts.$OutputBody["receipts"][number];

/**
 * A receipt as a feed event: for gifts received, it names the donor; for
 * gifts given or recorded, what it was for (else the receiving account, else
 * the bare address it went to).
 */
function giftEvent(
  view: ReceiptView,
  direction: "received" | "given" | "recorded",
): Extract<FeedEvent, { kind: "gift" }> {
  const receipt = toReceipt(view);
  const from = receipt.from;
  const to = receipt.to;
  const counterpart =
    direction === "received"
      ? from.kind === "account"
        ? from.did
        : null
      : (receipt.forUri ?? (to.kind === "account" ? to.did : null));
  return {
    kind: "gift",
    key: view.uri,
    time: timeOf(view.record.createdAt),
    direction,
    value: receipt.value,
    currency: receipt.currency,
    donor: from.kind === "account" ? from.did : from.kind === "text" ? from.value : null,
    counterpart,
    // Given or recorded to a bare address: the address is what there is to name.
    wallet:
      direction !== "received" && !counterpart && to.kind === "text"
        ? toWalletTarget(to.value, asNetwork(view.record.paymentNetwork))
        : null,
  };
}

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

const asNetwork = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

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
  const recordUris = new Set<string>();
  for (const event of taken) {
    if (event.kind === "endorsed" && event.subject?.startsWith("did:")) dids.add(event.subject);
    if (event.kind === "awarded" && event.recipient?.startsWith("did:")) dids.add(event.recipient);
    if (event.kind === "gift" && event.counterpart) {
      if (event.counterpart.startsWith("did:")) dids.add(event.counterpart);
      else recordUris.add(event.counterpart);
    }
  }
  const [cards, records] = await Promise.all([
    getActorCards([...dids]).then((list) => new Map(list.map((card) => [card.did, card]))),
    feedRecords([...recordUris]),
  ]);

  // An activity its own same-titled project holds: the project's row stands
  // for both (an organization often makes one of each for the same work).
  const projects = taken.flatMap((event) => (event.kind === "project" ? [event.project] : []));
  const shown = taken.filter(
    (event) => event.kind !== "activity" || !coveredByProject(event.activity, projects),
  );

  return {
    items: await withFeedHandles(groupFeed(shown, cards, records)),
    cursor: more ? encodeFeedCursor(state) : null,
  };
}

/**
 * The projects and activities gifts were for, by URI: their titles, pages and
 * pictures, read a hundred at a time.
 */
async function feedRecords(uris: string[]): Promise<Map<string, FeedTarget>> {
  const out = new Map<string, FeedTarget>();
  const projects = uris.filter((uri) => collectionOf(uri) === "org.hypercerts.collection");
  const activities = uris.filter((uri) => collectionOf(uri) === "org.hypercerts.claim.activity");
  await Promise.all([
    ...chunks(projects).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.collection.listCollections,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.collections) {
        const project = toProjectCard(view);
        out.set(view.uri, {
          kind: "record",
          uri: view.uri,
          title: project.title,
          href: `/${project.authorDid}/project/${project.rkey}`,
          imageUrl: project.imageUrl,
        });
      }
    }),
    ...chunks(activities).map(async (batch) => {
      const page = await api.call(
        org.hypercerts.claim.listActivities,
        { uris: batch as AtUri[], limit: 100 },
        read(),
      );
      for (const view of page.activities) {
        const activity = toActivityCard(view);
        out.set(view.uri, {
          kind: "record",
          uri: view.uri,
          title: activity.title,
          href: `/${didOf(view.uri)}/activity/${view.uri.split("/").pop()}`,
          imageUrl: activity.imageUrl,
        });
      }
    }),
  ]);
  return out;
}

/** How many accounts a grouped row names; the rest it counts. */
const GROUP_NAMED = 3;

/**
 * Rows from events, newest first: gifts, followers, follows and badges
 * awarded come together per day (and per badge), at their newest's place.
 */
function groupFeed(
  events: FeedEvent[],
  cards: Map<string, ActorCard>,
  records: Map<string, FeedTarget>,
): FeedRow[] {
  const rows: FeedRow[] = [];
  const groups = new Map<string, FeedRow>();
  const sums = new Map<string, Map<string, number>>();
  const donors = new Map<string, Set<string>>();
  const targetKeys = new Map<string, Set<string>>();
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
            targets: [],
            targetCount: 0,
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
        // What the gift went to (or came from), each once.
        const target: FeedTarget | undefined = event.counterpart
          ? event.counterpart.startsWith("did:")
            ? (() => {
                const actor = cards.get(event.counterpart);
                return actor ? { kind: "account" as const, actor } : undefined;
              })()
            : records.get(event.counterpart)
          : undefined;
        const seen = targetKeys.get(id) ?? new Set<string>();
        targetKeys.set(id, seen);
        const named = target ?? event.wallet ?? undefined;
        const key =
          event.counterpart ?? (event.wallet?.kind === "wallet" ? event.wallet.address : null);
        if (key && !seen.has(key)) {
          seen.add(key);
          row.targetCount += 1;
          if (named && row.targets.length < GROUP_NAMED) row.targets.push(named);
        }
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
    if (row.kind === "gifts") {
      return row.targets.flatMap((target) => (target.kind === "account" ? [target.actor] : []));
    }
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
    if (row.kind === "gifts") {
      return {
        ...row,
        targets: row.targets.map((target) =>
          target.kind === "account" ? { ...target, actor: card(target.actor) } : target,
        ),
      };
    }
    return row;
  });
}
