"use client"

import { useEffect, useState } from "react"
import { isDid } from "@/lib/utils/did"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"
import type { AuthorInfo } from "./use-author-info"

/**
 * Compact profile info for a contributor on an activity detail page.
 * Same shape as `AuthorInfo`, but hydrated from a free-form identity
 * string that may be a DID, a handle, or plain text.
 */
export type ContributorInfo = AuthorInfo

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
 * Resolve a contributor identity (DID or handle) to profile info through
 * the shared resolve-did coalescer, which batches every contributor on
 * an activity into one request, handles both DID and handle inputs, and
 * applies the Certs / Bluesky profile fallback server-side. Returns null
 * for an unresolvable identity (or a transient 429) — the caller renders
 * a plain-text fallback. Never rejects.
 */
function fetchContributor(identity: string): Promise<ContributorInfo | null> {
  return loadResolvedProfile(identity).then((data) => {
    if (!data) return null
    return {
      did: data.did,
      handle: data.handle || data.did,
      displayName: data.displayName ?? null,
      avatarUrl: data.avatar ?? null,
    }
  })
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
