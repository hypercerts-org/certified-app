"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type { CollectionValue } from "@/lib/atproto/collection"

const COLLECTION = "org.hypercerts.collection"

// Module-level cache + in-flight coalescer keyed by `${did} ${rkey}`, the
// same shape as `useActivity`'s. Funding lists render one "for" cell per
// receipt and thousands of receipts fund the same few projects, so each
// project is read once per session instead of once per row. Failures are
// not cached, so a remount retries.
const cache = createBoundedCache<string, CollectionValue>(500)
const inFlight = new Map<string, Promise<CollectionValue>>()

function load(did: string, rkey: string): Promise<CollectionValue> {
  const key = `${did} ${rkey}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const pending = inFlight.get(key)
  if (pending) return pending
  const params = new URLSearchParams({ repo: did, collection: COLLECTION, rkey })
  const p = authFetch(`/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`getRecord failed: ${res.status}`)
      const data = (await res.json()) as { value: CollectionValue }
      cache.set(key, data.value)
      return data.value
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/**
 * The value of an `org.hypercerts.collection` record (a project), read once
 * per session and shared by every caller. For list cells that only need the
 * title and image; the project page uses `useProject`.
 */
export function useProjectSummary(
  did: string | null,
  rkey: string | null,
): CollectionValue | null {
  const key = did && rkey ? `${did} ${rkey}` : null
  const [value, setValue] = useState<CollectionValue | null>(() =>
    key ? (cache.get(key) ?? null) : null,
  )
  useEffect(() => {
    if (!did || !rkey) {
      setValue(null)
      return
    }
    let live = true
    load(did, rkey)
      .then((v) => {
        if (live) setValue(v)
      })
      .catch(() => {
        if (live) setValue(null)
      })
    return () => {
      live = false
    }
  }, [did, rkey])
  return value
}
