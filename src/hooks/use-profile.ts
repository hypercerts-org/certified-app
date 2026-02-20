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
  const { agent, did, pdsUrl } = useAuth()
  const [profile, setProfile] = useState<CertifiedProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    // If not authenticated, return null profile without error
    if (!agent || !did) {
      setProfile(null)
      setIsLoading(false)
      setError(null)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const fetchedProfile = await getProfile(agent, did)
      setProfile(fetchedProfile)
    } catch (err) {
      console.error("Failed to fetch profile:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch profile")
    } finally {
      setIsLoading(false)
    }
  }, [agent, did])

  // Fetch profile on mount and when did changes
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Compute avatar and banner URLs
  const effectivePdsUrl = pdsUrl || process.env.NEXT_PUBLIC_PDS_URL || "https://otp.certs.network"
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
