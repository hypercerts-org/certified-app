// Curated list (`org.hypercerts.collection` list:*) read queries.
import "server-only";

import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "../cache";
import {
  type ActivityCard,
  awardSubject,
  didOf,
  formatDate,
  type ListCard,
  type ListItem,
  type Page,
  type ProjectCard,
  plainText,
  toActivityCard,
  toActorCard,
  toProjectCard,
} from "../views";
import { actorCards } from "./actors";
import {
  type AtUri,
  api,
  type BadgeAwardView,
  chunks,
  collectionOf,
  type Did,
  LIST_TYPES,
  notFound,
  PEOPLE_PAGE,
  publicData,
  read,
} from "./client";

const LIST_PAGE = 100;

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
    { authors: [did as Did], types: LIST_TYPES, limit: LIST_PAGE },
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
