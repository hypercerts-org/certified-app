"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

/**
 * Compact profile info for rendering an activity card's author byline.
 * Handles are resolved via /api/resolve-did which also returns the
 * Bluesky display name and avatar URL in one round-trip.
 */
export interface AuthorInfo {
  did: string
  handle: string
  displayName: string | null
  avatarUrl: string | null
}

// Module-level cache so the same author rendered in multiple feed cards
// only fires one network request. Shared across all `useAuthorInfo`
// callers for the lifetime of the JS module.
const cache = createBoundedCache<string, Promise<AuthorInfo>>()

function fetchAuthor(did: string): Promise<AuthorInfo> {
  const existing = cache.get(did)
  if (existing) return existing

  const p: Promise<AuthorInfo> = authFetch(
    `/api/resolve-did?did=${encodeURIComponent(did)}`
  )
    .then((res) => {
      if (!res.ok) throw new Error("Failed to resolve DID")
      return res.json() as Promise<{
        did: string
        handle: string
        displayName?: string
        avatar?: string
      }>
    })
    .then((data) => ({
      did,
      handle: data.handle || did,
      displayName: data.displayName ?? null,
      avatarUrl: data.avatar ?? null,
    }))
    .catch((err) => {
      // Invalidate the cache entry on error so a later render can retry
      cache.delete(did)
      throw err
    })

  cache.set(did, p)
  return p
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
