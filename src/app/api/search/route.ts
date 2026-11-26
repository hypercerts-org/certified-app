import { NextResponse } from "next/server";
import { activityHref, actorHref, projectHref } from "@/components/cards";
import {
  exploreAccounts,
  exploreActivities,
  exploreProjects,
  getActor,
} from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";

const PUBLIC_BSKY_APPVIEW = "https://public.api.bsky.app";

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

/**
 * GET /api/search?q=<query>&scope=all|actors&limit=<n>
 *
 * Public live search combining Certified's API (profiles, organizations,
 * projects, activities) with Bluesky's public actor typeahead so users can
 * find both Certified members and any AT Protocol account.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const scope = searchParams.get("scope") === "actors" ? "actors" : "all";
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "6", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 6, 1), 12);

  if (q.length < 2) {
    return NextResponse.json(
      { actors: [], projects: [], activities: [] },
      { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } },
    );
  }

  if (scope === "actors") {
    const actors = await searchActors(q, limit);
    return NextResponse.json(
      { actors },
      { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } },
    );
  }

  const [actors, projectsPage, activitiesPage] = await Promise.all([
    searchActors(q, Math.min(limit, 5)),
    exploreProjects({ query: q, sort: "newest", limit: 4 }).catch(() => ({
      items: [],
      cursor: null,
    })),
    exploreActivities({ query: q, sort: "newest", limit: 4 }).catch(() => ({
      items: [],
      cursor: null,
    })),
  ]);

  const projects: SearchRecordHit[] = projectsPage.items.map((p) => ({
    uri: p.uri,
    title: p.title,
    authorName: nameOf(p.author),
    href: projectHref(p),
  }));

  const activities: SearchRecordHit[] = activitiesPage.items.map((a) => ({
    uri: a.uri,
    title: a.title,
    authorName: nameOf(a.author),
    href: activityHref(a.uri),
  }));

  return NextResponse.json(
    { actors, projects, activities },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } },
  );
}
