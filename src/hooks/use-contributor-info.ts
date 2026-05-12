"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { isDid } from "@/lib/utils/did"
import { createBoundedCache } from "@/lib/utils/bounded-cache"
import type { AuthorInfo } from "./use-author-info"

/**
 * Compact profile info for a contributor on an activity detail page.
 * Same shape as `AuthorInfo`, but hydrated from a free-form identity
 * string that may be a DID, a handle, or plain text.
 */
export type ContributorInfo = AuthorInfo

// Module-level cache keyed by the raw contributor identity string.
// Keeps the same contributor appearing in multiple activities from
// triggering duplicate network requests.
const cache = createBoundedCache<string, Promise<ContributorInfo | null>>()

/**
 * Heuristic: does this look like an atproto handle? We can't be
 * certain without a lookup, but we can cheaply rule out obvious
 * non-handles (whitespace, missing TLD, etc.) so we don't hit the
 * network for plain-text contributor names.
 */
function looksLikeHandle(value: string): boolean {
  if (!value || /\s/.test(value)) return false
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(
    value
  )
}

/** Public check used by callers to decide whether to render the
 *  hydrated contributor row or fall back to plain text. */
export function isAtprotoIdentity(value: string | undefined | null): boolean {
  if (!value) return false
  const v = value.trim()
  return isDid(v) || looksLikeHandle(v)
}

/**
 * Resolve a contributor identity to profile info via `/api/resolve-did`,
 * which supports both `did=` and `handle=` query params and handles
 * Certs / Bluesky profile fallback internally.
 */
function fetchContributor(identity: string): Promise<ContributorInfo | null> {
  const existing = cache.get(identity)
  if (existing) return existing

  const query = isDid(identity)
    ? `did=${encodeURIComponent(identity)}`
    : `handle=${encodeURIComponent(identity)}`

  const p: Promise<ContributorInfo | null> = authFetch(
    `/api/resolve-did?${query}`
  )
    .then((res) => {
      if (!res.ok) return null
      return res.json() as Promise<{
        did: string
        handle: string
        displayName?: string
        avatar?: string
      }>
    })
    .then((data) => {
      if (!data) return null
      return {
        did: data.did,
        handle: data.handle || data.did,
        displayName: data.displayName ?? null,
        avatarUrl: data.avatar ?? null,
      }
    })
    .catch((err) => {
      // Invalidate on error so a later render can retry
      cache.delete(identity)
      throw err
    })

  cache.set(identity, p)
  return p
}

/**
 * Hydrate a contributor identity (DID, handle, or plain text) into
 * a { did, handle, displayName, avatarUrl } shape suitable for
 * rendering an avatar + byline.
 *
 * Returns `info: null` for non-atproto identities — callers should
 * check `isAtproto` (or `isAtprotoIdentity(identity)` directly) to
 * decide between the hydrated row and a plain-text fallback.
 */
export function useContributorInfo(identity: string | null | undefined): {
  info: ContributorInfo | null
  isLoading: boolean
  isAtproto: boolean
} {
  const trimmed = identity?.trim() || ""
  const isAtproto = isAtprotoIdentity(trimmed)

  const [info, setInfo] = useState<ContributorInfo | null>(null)
  const [isLoading, setIsLoading] = useState(isAtproto)

  useEffect(() => {
    if (!isAtproto) {
      setInfo(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchContributor(trimmed)
      .then((data) => {
        if (cancelled) return
        setInfo(data)
      })
      .catch(() => {
        if (cancelled) return
        setInfo(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [trimmed, isAtproto])

  return { info, isLoading, isAtproto }
}
