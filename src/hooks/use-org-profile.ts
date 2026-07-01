"use client"

import { useState, useEffect, useCallback } from "react"
import { useOrg } from "@/lib/groups/org-context"
import { getOrgProfile, getOrgMetadata } from "@/lib/groups/api"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { DEFAULT_PDS_URL } from "@/lib/utils/config"
import { getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type { OrgProfile, GroupMetadata } from "@/lib/groups/types"

interface OrgProfileData {
  orgProfile: OrgProfile | null
  orgMetadata: GroupMetadata | null
  pdsUrl: string | null
}

// Module-level cache so the same org profile rendered across the 4 layout
// components (navbar / mobile sidebar / desktop left rail / desktop top bar)
// fires one fan-out instead of three to four concurrent identical ones per
// navigation. Stores resolved-data promises keyed by `groupDid`; the
// in-flight map dedupes concurrent requests for the same DID. Mirrors
// use-org-marker / use-author-info.
const cache = createBoundedCache<string, OrgProfileData>()
const inFlight = new Map<string, Promise<OrgProfileData>>()

function fetchOrgProfileData(groupDid: string): Promise<OrgProfileData> {
  const cached = cache.get(groupDid)
  if (cached) return Promise.resolve(cached)

  const existing = inFlight.get(groupDid)
  if (existing) return existing

  const promise = (async (): Promise<OrgProfileData> => {
    try {
      const [profile, metadata, resolvedPds] = await Promise.all([
        getOrgProfile(groupDid).catch(() => null),
        getOrgMetadata(groupDid).catch(() => null),
        resolvePdsUrl(groupDid).catch(() => null),
      ])
      const result: OrgProfileData = {
        orgProfile: profile,
        orgMetadata: metadata,
        pdsUrl: resolvedPds,
      }
      cache.set(groupDid, result)
      return result
    } finally {
      inFlight.delete(groupDid)
    }
  })()

  inFlight.set(groupDid, promise)
  return promise
}

export function useOrgProfile(): {
  orgProfile: OrgProfile | null
  orgMetadata: GroupMetadata | null
  orgAvatarUrl: string | null
  orgBannerUrl: string | null
  isLoading: boolean
  refetch: () => Promise<void>
} {
  const { activeOrg } = useOrg()
  const groupDid = activeOrg?.groupDid ?? null
  // `fetched` holds the most recently resolved data plus the DID it belongs
  // to. It is seeded lazily from the module cache so a cache hit paints
  // synchronously without a fetch, and is only ever updated from inside the
  // effect's async callbacks (never synchronously in the effect body) — which
  // keeps the render derivation below the source of truth and avoids the
  // cascading-render lint on synchronous setState within effects.
  const [fetched, setFetched] = useState<{
    did: string
    data: OrgProfileData
  } | null>(() => {
    const cached = groupDid ? cache.get(groupDid) : null
    return cached ? { did: groupDid as string, data: cached } : null
  })
  const [refreshTick, setRefreshTick] = useState(0)

  // The cached entry for the current DID, if any. Read at render time so a
  // cache hit (e.g. another layout component already fetched this org) is
  // reflected without waiting for the effect to commit state.
  const cachedForDid =
    groupDid && refreshTick === 0 ? cache.get(groupDid) ?? null : null
  const resolved =
    cachedForDid ??
    (fetched && fetched.did === groupDid ? fetched.data : null)

  useEffect(() => {
    if (!groupDid) return
    if (refreshTick === 0 && cache.has(groupDid)) return

    let cancelled = false
    fetchOrgProfileData(groupDid)
      .then((data) => {
        if (cancelled) return
        setFetched({ did: groupDid, data })
      })
      .catch(() => {
        if (cancelled) return
        setFetched({
          did: groupDid,
          data: { orgProfile: null, orgMetadata: null, pdsUrl: null },
        })
      })

    return () => {
      cancelled = true
    }
  }, [groupDid, refreshTick])

  // Force a refetch: evict the cache so the fetch hits the network instead of
  // returning a stale entry, then bump the tick to re-run the effect. Returns
  // a promise that resolves when the underlying fetch settles, preserving the
  // old `refetch(): Promise<void>` contract.
  const refetch = useCallback(async (): Promise<void> => {
    if (!groupDid) {
      setRefreshTick((t) => t + 1)
      return
    }
    cache.delete(groupDid)
    setRefreshTick((t) => t + 1)
    await fetchOrgProfileData(groupDid).catch(() => undefined)
  }, [groupDid])

  const orgProfile = resolved?.orgProfile ?? null
  const orgMetadata = resolved?.orgMetadata ?? null
  const pdsUrl = resolved?.pdsUrl ?? null
  // Loading while we have an org but no resolved data for it yet.
  const isLoading = !!groupDid && resolved === null

  // Compute avatar/banner URLs using the org's PDS
  const effectivePdsUrl = pdsUrl || DEFAULT_PDS_URL
  const orgAvatarUrl = orgProfile && activeOrg
    ? getAvatarUrl(orgProfile, activeOrg.groupDid, effectivePdsUrl)
    : null
  const orgBannerUrl = orgProfile && activeOrg
    ? getBannerUrl(orgProfile, activeOrg.groupDid, effectivePdsUrl)
    : null

  return { orgProfile, orgMetadata, orgAvatarUrl, orgBannerUrl, isLoading, refetch }
}
