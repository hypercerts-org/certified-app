"use client"

import { useEffect, useMemo, useState } from "react"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"

/**
 * Resolve a batch of DIDs to display-name-or-handle strings via the
 * same `/api/resolve-did` endpoint `useAuthorInfo` uses, but collected
 * in one place so sort/search can read a synchronous map.
 *
 * Results hydrate over time — the consuming grid re-orders as names
 * land. DIDs that haven't resolved yet fall back to the raw DID
 * (lowercased) for sort comparison, which keeps unresolved items
 * grouped consistently instead of jumping around as each one resolves.
 *
 * Previously this hook was copy-pasted (with its module-scoped cache)
 * into both profile-endorsements.tsx and profile-followers.tsx; the
 * two copies were identical. Consolidating them into one module means
 * both surfaces share a single cache, so a DID resolved on one tab is
 * reused on the other.
 */
const nameCache = new Map<string, string>()
const namePromises = new Map<string, Promise<string>>()

function fetchName(did: string): Promise<string> {
  const cached = namePromises.get(did)
  if (cached) return cached
  // Resolve through the shared coalescer so the whole tab's DIDs batch
  // into one request instead of one per row. `loadResolvedProfile` never
  // rejects — a miss / transient 429 resolves to null, which we fall
  // back to the DID for (same behaviour as the old catch branch).
  const p = loadResolvedProfile(did).then((data) => {
    const name = (data?.displayName || data?.handle || did).toLowerCase()
    nameCache.set(did, name)
    return name
  })
  namePromises.set(did, p)
  return p
}

export function useAuthorNamesMap(dids: string[]): Map<string, string> {
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const missing = dids.filter((d) => !nameCache.has(d))
    if (missing.length === 0) return
    Promise.all(missing.map((d) => fetchName(d))).then(() => {
      if (!cancelled) setTick((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [dids])

  // Return a fresh Map view from the global cache, restricted to the
  // requested DIDs so consumers don't accidentally read stale entries
  // for DIDs not in the current tab.
  return useMemo(() => {
    const out = new Map<string, string>()
    for (const d of dids) {
      out.set(d, nameCache.get(d) ?? d.toLowerCase())
    }
    return out
  }, [dids])
}
