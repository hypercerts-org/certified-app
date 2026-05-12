"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { authFetch } from "@/lib/auth/fetch"
import { getProfile } from "@/lib/atproto/profile"
import type { CertifiedProfile } from "@/lib/atproto/types"

interface ResolvedProfile {
  displayName?: string
  description?: string
  avatar?: string
  banner?: string
}

/**
 * Merge the raw Certs profile record with the pre-resolved Bluesky
 * fallback. If the Certs record has no text fields, we synthesize a
 * profile from the resolved Bluesky values so the edit-form still has
 * something to render (this is the `isFallback` flag the consumer sees).
 */
function mergeProfile(
  certProfile: CertifiedProfile | null,
  resolved: ResolvedProfile | null
): { profile: CertifiedProfile | null; isFallback: boolean } {
  const certHasText = Boolean(
    certProfile && (certProfile.displayName || certProfile.description)
  )
  if (!certHasText && resolved && (resolved.displayName || resolved.description)) {
    return {
      profile: {
        ...certProfile,
        displayName: resolved.displayName,
        description: resolved.description,
        createdAt: certProfile?.createdAt || new Date().toISOString(),
      },
      isFallback: true,
    }
  }
  return { profile: certProfile, isFallback: false }
}

/**
 * Hook for the CURRENT (authenticated) user's profile.
 *
 * Returns two things in one shape:
 *
 *   1. `profile` — the raw `app.certified.actor.profile` record, used
 *      by the edit-profile form so it can preserve existing avatar/
 *      banner blob refs when the user updates other fields.
 *
 *   2. `avatarUrl` / `bannerUrl` — pre-resolved display URLs using the
 *      same server-side resolver as the feed bylines and other
 *      profiles (`/api/resolve-did`). Applies the Certs → Bluesky
 *      fallback per field so a user with a Certs displayName but no
 *      Certs avatar shows their Bluesky avatar.
 *
 * The two sources are fetched in parallel.
 */
export function useProfile(): {
  profile: CertifiedProfile | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  avatarUrl: string | null
  bannerUrl: string | null
  isFallback: boolean
} {
  const { isAuthenticated, did } = useAuth()
  const [profile, setProfile] = useState<CertifiedProfile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [isFallback, setIsFallback] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(
    async (signal?: AbortSignal, options?: { bypassCache?: boolean }) => {
      if (!isAuthenticated || !did) {
        setProfile(null)
        setAvatarUrl(null)
        setBannerUrl(null)
        setIsFallback(false)
        setIsLoading(false)
        setError(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Run both lookups in parallel.
        // - getProfile: raw Certs profile record (edit form needs the
        //   untouched blob refs so it can preserve them on save).
        // - /api/resolve-did: pre-resolved displayName/avatar/banner URLs
        //   with the Certs → Bluesky fallback baked in on the server.
        // Initial mount uses the default browser cache (max-age=60 is fine).
        // Callers that need fresh data after a save pass bypassCache:true.
        const init: RequestInit = {}
        if (options?.bypassCache) init.cache = "no-store"
        if (signal) init.signal = signal
        const [certResult, resolveResult] = await Promise.allSettled([
          getProfile(did, signal),
          authFetch(
            `/api/resolve-did?did=${encodeURIComponent(did)}`,
            init
          ).then((res) =>
            res.ok
              ? (res.json() as Promise<{
                  displayName?: string
                  description?: string
                  avatar?: string
                  banner?: string
                }>)
              : null
          ),
        ])
        if (signal?.aborted) return

        const certProfile =
          certResult.status === "fulfilled" ? certResult.value : null
        const resolved =
          resolveResult.status === "fulfilled" ? resolveResult.value : null

        const merged = mergeProfile(certProfile, resolved)
        setProfile(merged.profile)
        setIsFallback(merged.isFallback)
        setAvatarUrl(resolved?.avatar ?? null)
        setBannerUrl(resolved?.banner ?? null)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch profile:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch profile")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [isAuthenticated, did]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
    return () => controller.abort()
  }, [fetchProfile])

  // Explicit refetch() bypasses the browser cache so callers triggering it
  // (typically after a save) see fresh data within the same second instead
  // of waiting out the Cache-Control max-age window.
  const refetch = useCallback(
    () => fetchProfile(undefined, { bypassCache: true }),
    [fetchProfile]
  )

  return {
    profile,
    isLoading,
    error,
    refetch,
    avatarUrl,
    bannerUrl,
    isFallback,
  }
}
