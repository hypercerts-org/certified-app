"use client"

import { useEffect, useState } from "react"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"

/**
 * Compact profile info for rendering an activity card's author byline.
 * Handles are resolved via the batched resolve-did coalescer, which also
 * returns the Bluesky display name and avatar URL in one round-trip.
 */
export interface AuthorInfo {
  did: string
  handle: string
  displayName: string | null
  avatarUrl: string | null
}

/**
 * Resolve one author DID through the shared coalescer
 * (`loadResolvedProfile`), which batches all authors needed in a render
 * pass into a single request and dedupes/caches across every byline.
 * Never rejects: an unresolvable DID (or a transient 429) degrades to a
 * DID-only byline rather than a stuck skeleton or a retry storm.
 */
function fetchAuthor(did: string): Promise<AuthorInfo> {
  return loadResolvedProfile(did).then((data) => ({
    did,
    handle: data?.handle || did,
    displayName: data?.displayName ?? null,
    avatarUrl: data?.avatar ?? null,
  }))
}

export function useAuthorInfo(did: string | null): {
  info: AuthorInfo | null
  isLoading: boolean
  error: string | null
} {
  const [info, setInfo] = useState<AuthorInfo | null>(null)
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!did) {
      setInfo(null)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchAuthor(did)
      .then((data) => {
        if (cancelled) return
        setInfo(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to resolve author")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [did])

  return { info, isLoading, error }
}
