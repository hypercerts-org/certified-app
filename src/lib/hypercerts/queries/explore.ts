// Network Explore and Featured discovery queries.
import "server-only";

import { app, org } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "../cache";
import {
  awardSubject,
  didOf,
  type ExploreAccount,
  type ExploreActivity,
  type ExploreProject,
  type Page,
  toActorCard,
  toAge,
  toExploreActivity,
  toExploreProject,
} from "../views";
import { getActorCards } from "./actors";
import {
  type AtUri,
  api,
  chunks,
  collectionOf,
  type Did,
  publicData,
  read,
  withHandles,
  withHandlesIn,
} from "./client";

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
