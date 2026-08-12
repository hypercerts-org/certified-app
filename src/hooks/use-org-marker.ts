"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type { GroupMetadata, OrgUrlItem } from "@/lib/groups/types"

const ORG_MARKER_COLLECTION = "app.certified.actor.organization"

interface OrgMarkerResult {
  isOrg: boolean
  /** URL strings only — legacy callers depend on this `string[]` shape. */
  additionalUrls: string[]
  /** URL items with labels preserved. Editors need to round-trip the
   *  `label` field; the sidebar's read-only render still uses just the
   *  URL via `additionalUrls`. */
  urls: OrgUrlItem[]
  /** Full marker record (minus `urls`, which is exposed above as a
   *  typed array). The editor reads this to seed drafts; `null` means
   *  the record didn't exist or wasn't an org. */
  marker: GroupMetadata | null
}

// Module-level cache so re-visiting the same profile doesn't refetch the
// marker record. Stores resolved results (not promises) — the in-flight
// map below dedupes concurrent requests for the same DID.
const cache = createBoundedCache<string, OrgMarkerResult>()
const inFlight = new Map<string, Promise<OrgMarkerResult>>()

/**
 * Shape of an `urls` entry on the org marker record. Mirrors `OrgUrlItem`
 * but loosened to `unknown` so we can validate at runtime — the proxy
 * returns raw record JSON and we can't trust the shape.
 */
function extractUrls(value: unknown): OrgUrlItem[] {
  if (!value || typeof value !== "object") return []
  const record = value as { urls?: unknown }
  if (!Array.isArray(record.urls)) return []
  const out: OrgUrlItem[] = []
  for (const item of record.urls as unknown[]) {
    if (item && typeof item === "object" && "url" in item) {
      const url = (item as OrgUrlItem).url
      if (typeof url === "string" && url.length > 0) {
        const label = (item as OrgUrlItem).label
        out.push(typeof label === "string" && label.length > 0 ? { url, label } : { url })
      }
    }
  }
  return out
}

async function fetchOrgMarker(did: string): Promise<OrgMarkerResult> {
  const cached = cache.get(did)
  if (cached) return cached

  const existing = inFlight.get(did)
  if (existing) return existing

  const params = new URLSearchParams({
    repo: did,
    collection: ORG_MARKER_COLLECTION,
    rkey: "self",
  })

  const promise = (async (): Promise<OrgMarkerResult> => {
    try {
      const res = await authFetch(
        `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`
      )
      // Missing-record signal — the XRPC proxy surfaces the agent error
      // as 400 with `{ error: "RecordNotFound" }`, not a plain 404. The
      // foreign-PDS branch can still produce 404 directly. Treat both as
      // "not an org" and cache the negative result.
      if (res.status === 404 || res.status === 400) {
        let isRecordNotFound = res.status === 404
        if (res.status === 400) {
          try {
            const body = (await res.clone().json()) as { error?: string }
            isRecordNotFound = body?.error === "RecordNotFound"
          } catch {
            // Body wasn't JSON; assume the 400 was for some other reason
            // and don't cache.
          }
        }
        if (isRecordNotFound) {
          const result: OrgMarkerResult = {
            isOrg: false,
            additionalUrls: [],
            urls: [],
            marker: null,
          }
          cache.set(did, result)
          return result
        }
      }
      if (!res.ok) {
        // Treat other failures as "unknown" — don't cache, allow retry on
        // a later mount.
        return { isOrg: false, additionalUrls: [], urls: [], marker: null }
      }
      const data = (await res.json()) as { value?: unknown }
      const urls = extractUrls(data.value)
      const marker = (data.value && typeof data.value === "object"
        ? (data.value as GroupMetadata)
        : null)
      const result: OrgMarkerResult = {
        isOrg: true,
        additionalUrls: urls.map((u) => u.url),
        urls,
        marker,
      }
      cache.set(did, result)
      return result
    } catch {
      return { isOrg: false, additionalUrls: [], urls: [], marker: null }
    } finally {
      inFlight.delete(did)
    }
  })()

  inFlight.set(did, promise)
  return promise
}

/**
 * Detects whether a DID carries the `app.certified.actor.organization`
 * marker record at `rkey=self`. When present, also surfaces any
 * `additionalUrls` from the record so the profile sidebar can render
 * them in the org-only link list.
 *
 * Loading state: `isOrg` is `false` while loading, flipping to `true`
 * only once the marker is confirmed. This keeps the sidebar in
 * non-org mode during the initial paint to avoid layout flicker.
 */
export function useOrgMarker(did: string | null): {
  isOrg: boolean
  additionalUrls: string[]
  urls: OrgUrlItem[]
  marker: GroupMetadata | null
  isLoading: boolean
  /** Force a refetch (bypassing the module cache). Used by editors
   *  after a write so subsequent renders pick up the new record. */
  refresh: () => void
} {
  const initial = (): OrgMarkerResult => ({
    isOrg: false,
    additionalUrls: [],
    urls: [],
    marker: null,
  })
  const [result, setResult] = useState<OrgMarkerResult>(() =>
    did ? cache.get(did) ?? initial() : initial()
  )
  const [isLoading, setIsLoading] = useState<boolean>(() =>
    did ? !cache.has(did) : false
  )
  const [refreshTick, setRefreshTick] = useState(0)

  // Adjust state during render when the DID or refresh tick changes,
  // re-running the cache-aware initializer expressions. The cache itself
  // is only mutated in the effect (module-map mutation must not happen
  // during render), so on a refresh the stale entry is still readable
  // here — result keeps the pre-refresh value while isLoading flips true.
  const markerKey = `${did}|${refreshTick}`
  const [prevMarkerKey, setPrevMarkerKey] = useState(markerKey)
  if (prevMarkerKey !== markerKey) {
    setPrevMarkerKey(markerKey)
    setResult(did ? cache.get(did) ?? initial() : initial())
    setIsLoading(did ? refreshTick > 0 || !cache.has(did) : false)
  }

  useEffect(() => {
    if (!did) return
    // When the refresh tick changes, evict the cache so fetchOrgMarker
    // hits the network instead of returning the stale entry. Also drop any
    // in-flight promise for this DID: a concurrent mount's pending fetch
    // resolves to the pre-refresh value, and without clearing the dedupe
    // fetchOrgMarker would re-use it instead of issuing a fresh request.
    if (refreshTick > 0) {
      cache.delete(did)
      inFlight.delete(did)
    }
    if (cache.has(did) && refreshTick === 0) return
    let cancelled = false
    fetchOrgMarker(did)
      .then((res) => {
        if (cancelled) return
        setResult(res)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [did, refreshTick])

  return {
    ...result,
    isLoading,
    refresh: () => setRefreshTick((t) => t + 1),
  }
}
