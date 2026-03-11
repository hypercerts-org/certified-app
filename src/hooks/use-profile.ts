"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { getProfile, getAvatarUrl, getBannerUrl, getBlueskyProfile, getBlueskyAvatarUrl, getBlueskyBannerUrl } from "@/lib/atproto/profile"
import type { CertifiedProfile } from "@/lib/atproto/types"
import type { BlueskyProfile } from "@/lib/atproto/types"

function isCertifiedProfileEmpty(profile: CertifiedProfile | null): boolean {
  if (!profile) return true
  return !profile.displayName && !profile.description && !profile.avatar && !profile.banner && !profile.website
}

export function useProfile(): {
  profile: CertifiedProfile | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  avatarUrl: string | null
  bannerUrl: string | null
  isFallback: boolean
} {
  const { isAuthenticated, did, pdsUrl } = useAuth()
  const [profile, setProfile] = useState<CertifiedProfile | null>(null)
  const [blueskyProfile, setBlueskyProfile] = useState<BlueskyProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFallback, setIsFallback] = useState(false)

  const fetchProfile = useCallback(async (signal?: AbortSignal) => {
    if (!isAuthenticated || !did) {
      setProfile(null)
      setBlueskyProfile(null)
      setIsLoading(false)
      setError(null)
      setIsFallback(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const fetchedProfile = await getProfile(did)
      if (signal?.aborted) return

      if (isCertifiedProfileEmpty(fetchedProfile)) {
        // Certified profile is empty — try Bluesky fallback
        const bskyProfile = await getBlueskyProfile(did, signal)
        if (signal?.aborted) return

        if (bskyProfile && (bskyProfile.displayName || bskyProfile.description)) {
          setBlueskyProfile(bskyProfile)
          setIsFallback(true)
          // Create a CertifiedProfile-shaped object from Bluesky data (text fields only)
          setProfile({
            displayName: bskyProfile.displayName,
            description: bskyProfile.description,
            createdAt: bskyProfile.createdAt,
          })
        } else {
          setProfile(fetchedProfile)
          setBlueskyProfile(null)
          setIsFallback(false)
        }
      } else {
        setProfile(fetchedProfile)
        setBlueskyProfile(null)
        setIsFallback(false)
      }
    } catch (err) {
      if (signal?.aborted) return
      console.error("Failed to fetch profile:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch profile")
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [isAuthenticated, did])

  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
    return () => controller.abort()
  }, [fetchProfile])

  // Compute avatar and banner URLs
  const effectivePdsUrl = pdsUrl || process.env.NEXT_PUBLIC_PDS_URL || "https://certified.one"

  let avatarUrl: string | null = null
  let bannerUrl: string | null = null

  if (isFallback && blueskyProfile && did) {
    avatarUrl = getBlueskyAvatarUrl(blueskyProfile, did, effectivePdsUrl)
    bannerUrl = getBlueskyBannerUrl(blueskyProfile, did, effectivePdsUrl)
  } else if (profile && did) {
    avatarUrl = getAvatarUrl(profile, did, effectivePdsUrl)
    bannerUrl = getBannerUrl(profile, did, effectivePdsUrl)
  }

  return {
    profile,
    isLoading,
    error,
    refetch: fetchProfile,
    avatarUrl,
    bannerUrl,
    isFallback,
  }
}
