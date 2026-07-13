"use client"

import { useEffect, useState } from "react"
import { resolvePdsUrl } from "@/lib/atproto/did"

/**
 * Resolve a profile's PDS endpoint URL and expose a derived flag for
 * whether it's hosted on Bluesky's network (e.g. `*.host.bsky.network`).
 *
 * Module-level cache so re-renders / re-mounts don't trigger another
 * plc.directory round-trip for the same DID — PDS resolution requires
 * an off-app network call.
 */
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

interface ProfilePdsResult {
  pdsUrl: string | null
  isBskyHosted: boolean
  isLoading: boolean
}

export function useProfilePds(did: string | null): ProfilePdsResult {
  const [pdsUrl, setPdsUrl] = useState<string | null>(() =>
    did && cache.has(did) ? (cache.get(did) ?? null) : null,
  )
  const [isLoading, setIsLoading] = useState<boolean>(() => !!did && !cache.has(did))

  // Adjust state during render when the DID changes, re-running the
  // cache-aware initializer expressions. Inflight-map bookkeeping stays
  // in the effect (module-map mutation must not happen during render).
  const [prevDid, setPrevDid] = useState(did)
  if (prevDid !== did) {
    setPrevDid(did)
    setPdsUrl(did && cache.has(did) ? (cache.get(did) ?? null) : null)
    setIsLoading(!!did && !cache.has(did))
  }

  useEffect(() => {
    if (!did) return
    let cancelled = false
    // A cache hit still flows through a resolved promise so a fill that
    // races the mount (another component's resolve landing between our
    // render and this effect) can't leave isLoading stuck true — the
    // async sets bail out when nothing changed.
    const promise =
      inflight.get(did) ??
      (cache.has(did)
        ? Promise.resolve(cache.get(did) ?? null)
        : resolvePdsUrl(did))
    inflight.set(did, promise)
    promise
      .then((url) => {
        cache.set(did, url ?? null)
        inflight.delete(did)
        if (cancelled) return
        setPdsUrl(url ?? null)
        setIsLoading(false)
      })
      .catch(() => {
        inflight.delete(did)
        if (cancelled) return
        setPdsUrl(null)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [did])

  return {
    pdsUrl,
    isBskyHosted: pdsUrl ? isBskyHostedPdsUrl(pdsUrl) : false,
    isLoading,
  }
}

/** Match Bluesky-operated PDS hostnames. The current production
 *  pattern is `<word>.<region>.host.bsky.network`; the legacy
 *  `bsky.social` host is also recognised. */
function isBskyHostedPdsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith(".host.bsky.network") || host === "bsky.social"
  } catch {
    return false
  }
}
