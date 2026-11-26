import type { NextRequest } from "next/server";
import { actorHref } from "@/components/cards";
import {
  exploreAccounts,
  exploreActivities,
  exploreProjects,
  getActor,
} from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import { activityHref, projectHref } from "@/lib/routes";
import {
  ACCOUNT_CANDIDATES,
  goRow,
  mergeAccounts,
  rank,
  relevance,
  SEARCH_CANDIDATES,
  SEARCH_GROUP_ROWS,
  type SearchResults,
  type SearchRow,
} from "@/lib/search";
import { isDid } from "@/lib/validate";

// The sidebar search's dropdown: the best few activities, projects and
// accounts for what is typed so far (lib/search.ts ranks them), plus a row
// straight to a pasted handle, DID or link. Accounts not on Certified come
// from Bluesky's public search, after the Certified ones. Public data, so the
// CDN may keep a query's answer for a minute.
//
// With `scope=actors` it answers the account pickers instead (ActorPicker:
// Add member, Endorse someone, Award badge, contributors, funding parties):
// `{ actors }`, an account a handle or DID names first, then Certified
// accounts, then Bluesky's.

const MAX_QUERY = 200;
const PUBLIC_BSKY_APPVIEW = "https://public.api.bsky.app";
const BLUESKY_SEARCH = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors";
const cacheHeaders = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

type BlueskyActor = { did: string; handle: string; displayName?: string; avatar?: string };

/** Accounts on Bluesky matching `query`; none when Bluesky doesn't answer in time. */
async function blueskyAccounts(query: string): Promise<BlueskyActor[]> {
  try {
    const url = new URL(BLUESKY_SEARCH);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(ACCOUNT_CANDIDATES));
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { actors?: BlueskyActor[] };
    return body.actors ?? [];
  } catch {
    return [];
  }
}

export type SearchActorHit = {
  did: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  isOrganization: boolean;
  certified: boolean;
  href: string;
};

export type SearchRecordHit = {
  uri: string;
  title: string;
  authorName: string;
  href: string;
};

type BskyActor = {
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
};

async function searchBlueskyActors(q: string, limit: number): Promise<SearchActorHit[]> {
  try {
    const url = new URL("/xrpc/app.bsky.actor.searchActorsTypeahead", PUBLIC_BSKY_APPVIEW);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { actors?: BskyActor[] };
    return (data.actors ?? [])
      .filter((a): a is BskyActor & { did: string } => typeof a.did === "string")
      .map((a) => {
        const handle = typeof a.handle === "string" && a.handle ? a.handle : null;
        return {
          did: a.did,
          handle,
          displayName: a.displayName?.trim() || (handle ? `@${handle}` : a.did),
          avatarUrl: typeof a.avatar === "string" && a.avatar ? a.avatar : null,
          isOrganization: false,
          certified: false,
          href: `/${encodeURIComponent(handle ?? a.did)}`,
        };
      });
  } catch (err) {
    logError("[search] bluesky typeahead failed", err);
    return [];
  }
}

async function searchActors(q: string, limit: number): Promise<SearchActorHit[]> {
  const cleaned = q.replace(/^@/, "").trim();
  const [direct, certifiedPage, bsky] = await Promise.all([
    isDid(cleaned) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleaned)
      ? getActor(cleaned).catch(() => null)
      : Promise.resolve(null),
    exploreAccounts({ query: cleaned, sort: "newest", type: "all", limit }).catch(() => ({
      items: [],
      cursor: null,
    })),
    searchBlueskyActors(cleaned, limit),
  ]);

  const seen = new Set<string>();
  const merged: SearchActorHit[] = [];

  const push = (hit: SearchActorHit) => {
    if (seen.has(hit.did)) return;
    seen.add(hit.did);
    merged.push(hit);
  };

  if (direct) {
    push({
      did: direct.did,
      handle: direct.handle,
      displayName: nameOf(direct),
      avatarUrl: direct.avatarUrl,
      isOrganization: direct.isOrganization,
      certified: true,
      href: actorHref(direct),
    });
  }

  for (const account of certifiedPage.items) {
    push({
      did: account.did,
      handle: account.handle,
      displayName: nameOf(account),
      avatarUrl: account.avatarUrl,
      isOrganization: account.isOrganization,
      certified: true,
      href: actorHref(account),
    });
  }

  for (const actor of bsky) {
    push(actor);
  }

  return merged.slice(0, limit);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, MAX_QUERY);

  if (params.get("scope") === "actors") {
    const rawLimit = Number.parseInt(params.get("limit") ?? "6", 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 6, 1), 12);
    const actors = query.length < 2 ? [] : await searchActors(query, limit);
    return Response.json({ actors }, { headers: cacheHeaders });
  }

  const empty: SearchResults = { go: null, activities: [], projects: [], accounts: [] };
  if (!query) return Response.json(empty);

  const options = { query, sort: "newest", limit: SEARCH_CANDIDATES } as const;
  const [activities, projects, accounts, bluesky] = await Promise.all([
    exploreActivities(options).catch((err) => {
      logError("[search] activities failed", err);
      return { items: [] };
    }),
    exploreProjects(options).catch((err) => {
      logError("[search] projects failed", err);
      return { items: [] };
    }),
    exploreAccounts({ ...options, type: "all", limit: ACCOUNT_CANDIDATES }).catch((err) => {
      logError("[search] accounts failed", err);
      return { items: [] };
    }),
    blueskyAccounts(query),
  ]);

  const results: SearchResults = {
    go: goRow(query),
    activities: rank(query, activities.items, (a) => ({
      primary: a.title,
      secondary: a.summary ?? "",
    }))
      .slice(0, SEARCH_GROUP_ROWS)
      .map(
        (a): SearchRow => ({
          id: a.uri,
          kind: "activity",
          href: activityHref(a.uri),
          title: a.title,
          meta: nameOf(a.author),
          imageUrl: a.imageUrl,
          round: false,
        }),
      ),
    projects: rank(query, projects.items, (p) => ({
      primary: p.title,
      secondary: p.summary ?? "",
    }))
      .slice(0, SEARCH_GROUP_ROWS)
      .map(
        (p): SearchRow => ({
          id: p.uri,
          kind: "project",
          href: projectHref(p),
          title: p.title,
          meta: nameOf(p.author),
          imageUrl: p.imageUrl,
          round: false,
        }),
      ),
    accounts: mergeAccounts(
      rank(query, accounts.items, (a) => ({
        primary: `${a.displayName} ${a.handle ?? ""}`,
        secondary: a.description ?? "",
      })).map(
        (a): SearchRow => ({
          id: a.did,
          kind: "account",
          href: `/${a.handle ?? a.did}`,
          title: nameOf(a),
          meta: a.handle && nameOf(a) !== `@${a.handle}` ? `@${a.handle}` : null,
          imageUrl: a.avatarUrl,
          round: true,
        }),
      ),
      // Bluesky's search also matches bios, loosely: only accounts whose
      // name or handle has what was typed, best match first.
      rank(
        query,
        bluesky.filter((a) => relevance(query, `${a.displayName ?? ""} ${a.handle}`) > 0),
        (a) => ({ primary: `${a.displayName ?? ""} ${a.handle}` }),
      ).map((a) => ({
        did: a.did,
        id: a.did,
        kind: "account" as const,
        href: `/${a.handle}`,
        title: a.displayName?.trim() || `@${a.handle}`,
        meta: `@${a.handle} · On Bluesky`,
        imageUrl: a.avatar ?? null,
        round: true,
      })),
      new Set(accounts.items.map((a) => a.did)),
    ),
  };
  return Response.json(results, { headers: cacheHeaders });
}
