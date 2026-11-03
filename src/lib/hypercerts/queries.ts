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
import {
  type ActivityCard,
  type ActorCard,
  type ActorDetail,
  type AwardSubject,
  type AwardsIssued,
  awardSubject,
  type BadgeCard,
  collectionOf,
  didOf,
  type Page,
  type ProjectCard,
  type ProjectDetail,
  toActivityCard,
  toActorCard,
  toActorDetail,
  toBadgeCard,
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

// Public, indexed data: shared by every visitor, refreshed within about a minute.
// Next.js uses the same profile for the prerendered page and its ISR upgrade.
function publicData(...tags: string[]) {
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  cacheTag(...tags);
}

// Callers validate identifiers before they reach these functions (see
// src/lib/validate.ts); the casts only satisfy lex's branded string types.
type ActivityView = org.hypercerts.claim.getActivity.ActivityView;
type Did = l.DidString;
type AtUri = l.AtUriString;

export async function getActor(actor: string): Promise<ActorDetail | null> {
  "use cache";
  publicData(`actor:${actor}`);

  const profile = await api.xrpcSafe(app.certified.actor.getProfile, {
    params: { actor: actor as l.AtIdentifierString },
    ...read(),
  });

  // app.certified.actor.getProfile accepts a handle or DID; app.certified.actor.getOrganization needs the DID and fails
  // for accounts without an organization record (people). An organization can
  // exist without a profile, so a DID gets the organization lookup either way.
  const did = profile.success
    ? profile.body.profile.did
    : actor.startsWith("did:")
      ? (actor as Did)
      : null;
  if (!did) return null;
  const organization = await api.xrpcSafe(app.certified.actor.getOrganization, {
    params: { actor: did },
    ...read(),
  });
  if (organization.success) return toActorDetail(organization.body.actor);
  return profile.success
    ? toActorDetail({ did, profile: profile.body.profile, organization: null })
    : null;
}

export async function listActivitiesPage(options: {
  author?: string;
  cursor?: string;
  limit?: number;
}): Promise<Page<ActivityCard>> {
  "use cache";
  publicData(options.author ? `activities:${options.author}` : "activities");

  const { activities, cursor } = await api.call(
    org.hypercerts.claim.listActivities,
    {
      authors: options.author ? [options.author as Did] : undefined,
      cursor: options.cursor,
      limit: options.limit ?? 10,
    },
    read(),
  );
  return { items: activities.map(toActivityCard), cursor: cursor ?? null };
}

export async function listProjectsPage(options: {
  author: string;
  cursor?: string;
}): Promise<Page<ProjectCard>> {
  "use cache";
  publicData(`projects:${options.author}`);

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
  publicData(`project:${uri}`);

  const result = await api.xrpcSafe(org.hypercerts.collection.getCollection, {
    params: { uri: uri as AtUri },
    ...read(),
  });
  return result.success ? toProjectDetail(result.body.collection) : null;
}

export async function listProjectActivitiesPage(options: {
  project: string;
  cursor?: string;
}): Promise<Page<ActivityCard>> {
  "use cache";
  publicData(`project:${options.project}`);

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
  return { items: activities.map(toActivityCard), cursor: cursor ?? null };
}

export async function listOrganizationsPage(options: {
  query?: string;
  cursor?: string;
}): Promise<Page<ActorCard>> {
  "use cache";
  publicData("organizations");

  const params = { cursor: options.cursor, limit: 12 };
  const { actors, cursor } = options.query
    ? await api.call(
        app.certified.actor.searchOrganizations,
        { ...params, search: options.query },
        read(),
      )
    : await api.call(app.certified.actor.listOrganizations, params, read());
  return { items: actors.map(toActorCard), cursor: cursor ?? null };
}

export async function listBadgesReceived(did: string): Promise<BadgeCard[]> {
  "use cache";
  publicData(`badges:${did}`);

  const { badgeAwards } = await api.call(
    app.certified.badge.listBadgeAwards,
    { subjects: [did], limit: 20 },
    read(),
  );
  return badgeAwards.map(toBadgeCard);
}

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
  publicData(`awards-issued:${did}`);

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
      if (!subject) continue;
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

export async function hasIssuedAwards(did: string): Promise<boolean> {
  "use cache";
  publicData(`awards-issued:${did}`);

  const { badgeAwards } = await api.call(
    app.certified.badge.listBadgeAwards,
    { authors: [did as Did], limit: 1 },
    read(),
  );
  return badgeAwards.length > 0;
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
  return cards;
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
  publicData(`awards-issued:${did}`);

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
