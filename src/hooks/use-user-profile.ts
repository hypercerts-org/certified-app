"use client"

import { useCallback, useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { authFetch } from "@/lib/auth/fetch"
import type { CertifiedProfile } from "@/lib/atproto/types"

/**
 * Fetch any user's profile by handle or DID.
 *
 * Delegates all of the profile resolution to the existing server-side
 * endpoint `/api/resolve-did`, which already returns:
 *
 *   - handle
 *   - displayName (Certs → Bluesky → undefined)
 *   - description (Certs → Bluesky → undefined)
 *   - avatar URL   (Certs → Bluesky cdn.bsky.app → undefined)
 *   - banner URL   (Certs → Bluesky cdn.bsky.app → undefined)
 *
 * This keeps the federation-aware blob resolution on the server (which
 * runs as the authenticated proxy agent and can reach any user's PDS)
 * and avoids having the client construct `getBlob` URLs against our
 * own PDS for blobs that live on someone else's PDS — the bug that
 * made Bluesky avatars/banners 404 on other users' profiles.
 *
 * For handle inputs we first hit `/api/resolve-handle` to get the DID.
 */
export function useUserProfile(handleOrDid: string | null): {
  profile: CertifiedProfile | null
  avatarUrl: string | null
  bannerUrl: string | null
  did: string | null
  handle: string | null
  isOwnProfile: boolean
  isLoading: boolean
  error: string | null
  /** Why `error` is set: "not-found" when the handle or DID names no
   *  account (the resolver answered 400/404), "failed" when the lookup
   *  itself failed (network, rate limit, server error) and a retry may
   *  work. Null without an error. */
  errorKind: "not-found" | "failed" | null
  /** Look the profile up again (after a failed load). */
  retry: () => void
  /** True when the resolved DID has an `app.certified.actor.profile`
   *  record with a populated displayName. Surfaces / chrome that
   *  want to flag bsky-sourced profile data ("Bluesky profile" tag
   *  in the sidebar / header — issue #74) read this. */
  hasCertifiedProfile: boolean
  /** Whether the account has a populated app.bsky.actor.profile record. */
  hasBlueskyProfile: boolean
} {
  const { did: myDid } = useAuth()
  const [did, setDid] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [profile, setProfile] = useState<CertifiedProfile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [hasCertifiedProfile, setHasCertifiedProfile] = useState(false)
  const [hasBlueskyProfile, setHasBlueskyProfile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<"not-found" | "failed" | null>(null)
  // Bumped by `retry` to run the lookup again.
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    async function run() {
      if (!handleOrDid) {
        setDid(null)
        setHandle(null)
        setProfile(null)
        setAvatarUrl(null)
        setBannerUrl(null)
        setIsLoading(false)
        setError(null)
        setErrorKind(null)
        return
      }

      setIsLoading(true)
      setError(null)
      setErrorKind(null)

      try {
        // /api/resolve-did accepts either ?did=… or ?handle=… and does
        // the handle->DID lookup server-side, in parallel with the
        // Certs / Bluesky profile fetches. Calling it directly skips
        // the otherwise-redundant client->/api/resolve-handle hop.
        const url = handleOrDid.startsWith("did:")
          ? `/api/resolve-did?did=${encodeURIComponent(handleOrDid)}`
          : `/api/resolve-did?handle=${encodeURIComponent(handleOrDid)}`
        // A retry skips the browser's HTTP cache, so it really asks again.
        const res = await authFetch(url, {
          signal,
          ...(attempt > 0 ? { cache: "reload" as const } : {}),
        })
        if (!res.ok) {
          if (signal.aborted) return
          // 400 / 404: the handle or DID names no account. Anything else
          // (429, 5xx) is a failed lookup, not a missing profile.
          throw new ProfileLookupError(
            res.status === 400 || res.status === 404 ? "not-found" : "failed",
          )
        }
        const data = (await res.json()) as {
          did: string
          handle: string
          displayName?: string
          description?: string
          pronouns?: string
          website?: string
          avatar?: string
          banner?: string
          createdAt?: string
          hasCertifiedProfile?: boolean
          hasBlueskyProfile?: boolean
        }
        if (signal.aborted) return

        setDid(data.did)
        setHandle(data.handle)
        setProfile({
          displayName: data.displayName,
          description: data.description,
          pronouns: data.pronouns,
          website: data.website,
          createdAt: data.createdAt,
        })
        setAvatarUrl(data.avatar ?? null)
        setBannerUrl(data.banner ?? null)
        setHasCertifiedProfile(!!data.hasCertifiedProfile)
        setHasBlueskyProfile(!!data.hasBlueskyProfile)
      } catch (err) {
        if (signal.aborted) return
        console.error("Failed to load user profile:", err)
        setError(err instanceof Error ? err.message : "Failed to load profile")
        // A network error (fetch rejects) is a failed load too.
        setErrorKind(err instanceof ProfileLookupError ? err.kind : "failed")
        setProfile(null)
        setAvatarUrl(null)
        setBannerUrl(null)
        setHasCertifiedProfile(false)
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [handleOrDid, attempt])

  const isOwnProfile = !!did && did === myDid
  // Hide bsky fallback values on the viewer's own profile when they
  // haven't authored a Certified profile yet. The onboarding banner
  // is the only thing they should see on their own page until they
  // finish setup — otherwise pre-existing bsky data masquerades as
  // "your Certified profile" before any record has been written.
  // Foreign visitors continue to see the bsky fallback as before.
  const suppressFallback = isOwnProfile && !hasCertifiedProfile

  return {
    profile: suppressFallback ? null : profile,
    avatarUrl: suppressFallback ? null : avatarUrl,
    bannerUrl: suppressFallback ? null : bannerUrl,
    did,
    handle,
    isOwnProfile,
    isLoading,
    error,
    errorKind,
    retry,
    hasCertifiedProfile,
    hasBlueskyProfile,
  }
}

/** A non-OK answer from the resolver, with what it means for the page. */
class ProfileLookupError extends Error {
  constructor(readonly kind: "not-found" | "failed") {
    super(kind === "not-found" ? "Profile not found" : "Couldn't load the profile")
  }
}
