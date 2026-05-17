"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type { OrgUrlItem } from "@/lib/groups/types"

const ORG_MARKER_COLLECTION = "app.certified.actor.organization"

interface OrgMarkerResult {
  isOrg: boolean
  additionalUrls: string[]
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
function extractUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") return []
  const record = value as { urls?: unknown }
  if (!Array.isArray(record.urls)) return []
  const out: string[] = []
  for (const item of record.urls as unknown[]) {
    if (item && typeof item === "object" && "url" in item) {
      const url = (item as OrgUrlItem).url
      if (typeof url === "string" && url.length > 0) out.push(url)
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
          const result = { isOrg: false, additionalUrls: [] }
          cache.set(did, result)
          return result
        }
      }
      if (!res.ok) {
        // Treat other failures as "unknown" — don't cache, allow retry on
        // a later mount.
        return { isOrg: false, additionalUrls: [] }
      }
      const data = (await res.json()) as { value?: unknown }
      const result: OrgMarkerResult = {
        isOrg: true,
        additionalUrls: extractUrls(data.value),
      }
      cache.set(did, result)
      return result
    } catch {
      return { isOrg: false, additionalUrls: [] }
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
  isLoading: boolean
} {
  const [result, setResult] = useState<OrgMarkerResult>(() =>
    did ? cache.get(did) ?? { isOrg: false, additionalUrls: [] } : { isOrg: false, additionalUrls: [] }
  )
  const [isLoading, setIsLoading] = useState<boolean>(() =>
    did ? !cache.has(did) : false
  )

  useEffect(() => {
    if (!did) {
      setResult({ isOrg: false, additionalUrls: [] })
      setIsLoading(false)
      return
    }
    const cached = cache.get(did)
    if (cached) {
      setResult(cached)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
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
  }, [did])

  return { ...result, isLoading }
}
