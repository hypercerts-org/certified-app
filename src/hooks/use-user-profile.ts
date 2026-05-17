"use client"

import { useState, useEffect } from "react"
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
} {
  const { did: myDid } = useAuth()
  const [did, setDid] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [profile, setProfile] = useState<CertifiedProfile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // /api/resolve-did accepts either ?did=… or ?handle=… and does
        // the handle->DID lookup server-side, in parallel with the
        // Certs / Bluesky profile fetches. Calling it directly skips
        // the otherwise-redundant client->/api/resolve-handle hop.
        const url = handleOrDid.startsWith("did:")
          ? `/api/resolve-did?did=${encodeURIComponent(handleOrDid)}`
          : `/api/resolve-did?handle=${encodeURIComponent(handleOrDid)}`
        const res = await authFetch(url, { signal })
        if (!res.ok) {
          if (signal.aborted) return
          throw new Error("Profile not found")
        }
        const data = (await res.json()) as {
          did: string
          handle: string
          displayName?: string
          description?: string
          avatar?: string
          banner?: string
          createdAt?: string
        }
        if (signal.aborted) return

        setDid(data.did)
        setHandle(data.handle)
        setProfile({
          displayName: data.displayName,
          description: data.description,
          createdAt: data.createdAt,
        })
        setAvatarUrl(data.avatar ?? null)
        setBannerUrl(data.banner ?? null)
      } catch (err) {
        if (signal.aborted) return
        console.error("Failed to load user profile:", err)
        setError(err instanceof Error ? err.message : "Failed to load profile")
        setProfile(null)
        setAvatarUrl(null)
        setBannerUrl(null)
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [handleOrDid])

  return {
    profile,
    avatarUrl,
    bannerUrl,
    did,
    handle,
    isOwnProfile: !!did && did === myDid,
    isLoading,
    error,
  }
}
