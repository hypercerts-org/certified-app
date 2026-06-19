/**
 * Account typeahead that finds BOTH Certified accounts and Bluesky-native
 * accounts, merged by DID. Shared by the list account-picker and the
 * "Endorse people" modal so both surfaces behave the same.
 *
 * Why two sources:
 *   - the magic-indexer's Certified actor index finds onboarded accounts
 *     AND Certified-only orgs (e.g. biofi-project) that have no Bluesky
 *     profile and so never appear in Bluesky's search;
 *   - Bluesky's AppView finds bsky-native accounts (e.g. maearth.com)
 *     that have no Certified profile.
 *
 * The source also records which profile lexicon backs the account
 * (`profileNsid`) — the list picker strong-refs that record; the endorse
 * modal only needs the DID and ignores it.
 */

import { fetchNetworkActors } from "@/lib/atproto/workspace"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"
import { BSKY_ACTOR_PROFILE_NSID } from "@/lib/atproto/typed-lists"

const CERTIFIED_ACTOR_PROFILE_NSID = "app.certified.actor.profile"

export interface MergedActor {
  did: string
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
  /** Profile lexicon backing the account — Certified for indexer
   *  (onboarded) accounts, Bluesky for bsky-only ones. */
  profileNsid: string
}

/** Bluesky AppView actor search — finds bsky-native accounts (which may
 *  have no Certified profile). Returns [] on any failure so the indexer
 *  results still surface. */
async function searchBskyActors(
  query: string,
  signal?: AbortSignal,
): Promise<{ did: string; handle?: string; displayName?: string; avatar?: string }[]> {
  try {
    const res = await fetch(
      `/api/search-actors?q=${encodeURIComponent(query)}&limit=10`,
      signal ? { signal } : undefined,
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      actors?: { did?: string; handle?: string; displayName?: string; avatar?: string }[]
    }
    return (data.actors ?? []).filter((a): a is { did: string } & typeof a => !!a.did)
  } catch {
    return []
  }
}

/**
 * Search Certified + Bluesky accounts, merged and deduped by DID.
 * Indexer (Certified) hits win on overlap and carry the Certified profile
 * NSID; bsky-only hits carry the Bluesky profile NSID. Handles missing
 * from the indexer rows are backfilled in one batched `/api/resolve-dids`
 * call. Returns [] for an empty query or once the signal aborts.
 */
export async function searchMergedActors(
  query: string,
  signal?: AbortSignal,
): Promise<MergedActor[]> {
  if (!query.trim()) return []

  const [indexerPage, bsky] = await Promise.all([
    fetchNetworkActors({ first: 10, search: query, signal }).catch(() => ({ actors: [] })),
    searchBskyActors(query, signal),
  ])
  if (signal?.aborted) return []

  const byDid = new Map<string, MergedActor>()
  // Certified (indexer) accounts first — preferred on overlap.
  for (const a of indexerPage.actors) {
    byDid.set(a.did, {
      did: a.did,
      displayName: a.displayName,
      handle: null,
      avatarUrl: a.avatarUrl,
      profileNsid: CERTIFIED_ACTOR_PROFILE_NSID,
    })
  }
  // Bluesky accounts: fill gaps on a Certified match, else add a bsky-only
  // entry carrying the Bluesky profile NSID.
  for (const a of bsky) {
    const existing = byDid.get(a.did)
    if (existing) {
      existing.handle ??= a.handle ?? null
      existing.displayName ??= a.displayName ?? null
      existing.avatarUrl ??= a.avatar ?? null
      continue
    }
    byDid.set(a.did, {
      did: a.did,
      displayName: a.displayName ?? null,
      handle: a.handle ?? null,
      avatarUrl: a.avatar ?? null,
      profileNsid: BSKY_ACTOR_PROFILE_NSID,
    })
  }

  // Backfill handles for indexer-only accounts (the profile connection
  // doesn't denormalise handle), batched into one /api/resolve-dids call.
  const merged = [...byDid.values()]
  await Promise.all(
    merged.map(async (a) => {
      if (a.handle) return
      a.handle = await loadResolvedProfile(a.did)
        .then((r) => r?.handle ?? null)
        .catch(() => null)
    }),
  )
  if (signal?.aborted) return []

  return merged
}
