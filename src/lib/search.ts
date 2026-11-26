// The sidebar search's dropdown (sidebar-nav.tsx, /api/search): its rows,
// how matches are ranked, and the row a pasted identifier gets. Pure, so it
// is tested without the network.
//
// The API returns matches newest first, not by relevance, so the route asks
// for more than it shows (fetch wide, show narrow) and ranks them here: a
// title or name that is the search, then one that starts with it, then one
// with a word that does, then one that contains it, then a match in the
// description only.

import { parseTarget } from "@/lib/hypercerts/resolve-target";

/** One row of the dropdown, as the route sends it. */
export type SearchRow = {
  /** Unique within the results. */
  id: string;
  kind: "activity" | "project" | "account" | "go";
  href: string;
  title: string;
  /** Under the title: who made it, a handle, "On Bluesky". */
  meta: string | null;
  /** A record's picture, an account's avatar. */
  imageUrl: string | null;
  /** Accounts' pictures are round, records' square. */
  round: boolean;
};

export type SearchActorHit = {
  did: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  isOrganization: boolean;
  certified: boolean;
  href: string;
};

export type SearchResults = {
  /** A pasted handle, DID or link: straight to its page. */
  go: SearchRow | null;
  activities: SearchRow[];
  projects: SearchRow[];
  accounts: SearchRow[];
};

/** Rows per group, as on staging: records first, a short accounts group after. */
export const SEARCH_GROUP_ROWS = 3;
/** Matches asked of each source, to rank before showing SEARCH_GROUP_ROWS. */
export const SEARCH_CANDIDATES = 25;
/** Accounts asked of each account source (Certified, Bluesky). */
export const ACCOUNT_CANDIDATES = 6;

/** Lowercase, accents folded, spaces collapsed: "Bioacústico" finds "bioacustico". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** How well `query` matches: higher is better, 0 for no match in either text. */
export function relevance(query: string, primary: string, secondary = ""): number {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(primary);
  if (name === q) return 5;
  if (name.startsWith(q)) return 4;
  if (name.split(/[\s\-_.@/]+/).some((word) => word.startsWith(q))) return 3;
  if (name.includes(q)) return 2;
  if (normalize(secondary).includes(q)) return 1;
  return 0;
}

/**
 * `items` best match first; ties keep the order they came in (newest first).
 * Items that match nowhere stay, last: the API matched them on a field this
 * can't see.
 */
export function rank<T>(
  query: string,
  items: readonly T[],
  text: (item: T) => { primary: string; secondary?: string },
): T[] {
  return items
    .map((item, index) => {
      const { primary, secondary } = text(item);
      return { item, index, score: relevance(query, primary, secondary) };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * The accounts group: Certified accounts first (ranked), then Bluesky-only
 * accounts to fill it, never one twice, at most `limit`.
 */
export function mergeAccounts(
  certified: readonly SearchRow[],
  bluesky: readonly (SearchRow & { did: string })[],
  certifiedDids: ReadonlySet<string>,
  limit = SEARCH_GROUP_ROWS,
): SearchRow[] {
  const others = bluesky.filter((row) => !certifiedDids.has(row.did));
  return [...certified, ...others.map(({ did: _did, ...row }) => row)].slice(0, limit);
}

/** Where a pasted handle, DID, AT-URI or Certified link leads, or null when the text isn't one. */
export function goRow(query: string): SearchRow | null {
  const parsed = parseTarget(query);
  if (!parsed) return null;
  const row = (href: string, title: string): SearchRow => ({
    id: `go:${href}`,
    kind: "go",
    href,
    title: `Go to ${title}`,
    meta: null,
    imageUrl: null,
    round: false,
  });
  switch (parsed.kind) {
    case "handle":
      // A bare word ("forest") is not a handle; a handle has a dot.
      // Always build a canonical single-slash path (never raw URL.pathname,
      // which can start with "//evil.com" and trigger an open redirect).
      return parsed.handle.includes(".")
        ? row(`/${encodeURIComponent(parsed.handle)}`, `@${parsed.handle}`)
        : null;
    case "did":
      return row(`/${parsed.did}`, parsed.did);
    case "record-path": {
      const seg = parsed.collection === "org.hypercerts.claim.activity" ? "activity" : "project";
      const actorSeg = parsed.actor.startsWith("did:")
        ? parsed.actor
        : encodeURIComponent(parsed.actor);
      return row(`/${actorSeg}/${seg}/${encodeURIComponent(parsed.rkey)}`, query.trim());
    }
    case "uri": {
      const [, , did, collection, rkey] = parsed.uri.split("/");
      if (!rkey) return row(`/${did}`, did);
      if (collection === "org.hypercerts.claim.activity") {
        return row(`/${did}/activity/${encodeURIComponent(rkey)}`, `Activity ${rkey}`);
      }
      if (collection === "org.hypercerts.collection") {
        return row(`/${did}/project/${encodeURIComponent(rkey)}`, `Project ${rkey}`);
      }
      return null;
    }
  }
}
