"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { getProfile, getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile"
import type { CertifiedProfile } from "@/lib/atproto/types"

export function useProfile(): {
  profile: CertifiedProfile | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  avatarUrl: string | null
  bannerUrl: string | null
} {
  const { isAuthenticated, did, pdsUrl } = useAuth()
  const [profile, setProfile] = useState<CertifiedProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async (signal?: AbortSignal) => {
    // If not authenticated, return null profile without error
    if (!isAuthenticated || !did) {
      setProfile(null)
      setIsLoading(false)
      setError(null)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const fetchedProfile = await getProfile(did)
      if (signal?.aborted) return
      setProfile(fetchedProfile)
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

  // Fetch profile on mount and when did changes
  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
    return () => controller.abort()
  }, [fetchProfile])

  // Compute avatar and banner URLs
  const effectivePdsUrl = pdsUrl || process.env.NEXT_PUBLIC_PDS_URL || "https://epds1.test.certified.app"
  const avatarUrl = profile && did ? getAvatarUrl(profile, did, effectivePdsUrl) : null
  const bannerUrl = profile && did ? getBannerUrl(profile, did, effectivePdsUrl) : null

  return {
    profile,
    isLoading,
    error,
    refetch: fetchProfile,
    avatarUrl,
    bannerUrl,
  }
}
