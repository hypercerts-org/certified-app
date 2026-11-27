// Endorsements, follows (actor & project), and likes/reactions read queries.
import "server-only";

import { app } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { logError } from "@/lib/log";
import { tags } from "../cache";
import {
  type ActorCard,
  awardSubject,
  ENDORSEMENT_BADGE_TYPE,
  type EndorsementCard,
  type EndorsementRef,
  type FollowRef,
  formatDate,
  type PersonRow,
  PLAIN_ENDORSEMENT,
  type ProjectCard,
  toActorCard,
  toEndorsementCard,
  toProjectCard,
  type toProjectDetail,
} from "../views";
import { actorCards } from "./actors";
import {
  type AtUri,
  api,
  type CollectionViewLike,
  type Did,
  publicData,
  read,
  withHandlesIn,
} from "./client";

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
