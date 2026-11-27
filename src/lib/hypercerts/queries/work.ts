// Activities, projects, record counts, network counts, and workspace work queries.
import "server-only";

import type { l } from "@atproto/lex";
import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { logError } from "@/lib/log";
import { type RichText, richTextOf } from "@/lib/rich-text";
import { tags } from "../cache";
import {
  type ActivityCard,
  type Contributor,
  didOf,
  type LatestRecord,
  type Page,
  type ProjectCard,
  type ProjectDetail,
  toActivityCard,
  toContributors,
  toProjectCard,
  toProjectDetail,
} from "../views";
import {
  type ActivityView,
  type AtUri,
  api,
  chunks,
  type Did,
  LIST_TYPES,
  notFound,
  publicData,
  read,
  withHandles,
  withHandlesIn,
} from "./client";

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
