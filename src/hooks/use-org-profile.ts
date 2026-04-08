"use client"

import { useState, useEffect, useCallback } from "react"
import { useOrg } from "@/lib/organizations/org-context"
import { getOrgProfile, getOrgMetadata } from "@/lib/organizations/api"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile"
import type { OrgProfile, OrgOrganization } from "@/lib/organizations/types"
import type { CertifiedProfile } from "@/lib/atproto/types"

export function useOrgProfile(): {
  orgProfile: OrgProfile | null
  orgMetadata: OrgOrganization | null
  orgAvatarUrl: string | null
  orgBannerUrl: string | null
  isLoading: boolean
  refetch: () => Promise<void>
} {
  const { activeOrg } = useOrg()
  const [orgProfile, setOrgProfile] = useState<OrgProfile | null>(null)
  const [orgMetadata, setOrgMetadata] = useState<OrgOrganization | null>(null)
  const [pdsUrl, setPdsUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!activeOrg) {
        setOrgProfile(null)
        setOrgMetadata(null)
        setPdsUrl(null)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const [profile, metadata, resolvedPds] = await Promise.all([
          getOrgProfile(activeOrg.groupDid, signal).catch(() => null),
          getOrgMetadata(activeOrg.groupDid, signal).catch(() => null),
          resolvePdsUrl(activeOrg.groupDid).catch(() => null),
        ])
        if (!signal?.aborted) {
          setOrgProfile(profile)
          setOrgMetadata(metadata)
          setPdsUrl(resolvedPds)
        }
      } catch {
        if (!signal?.aborted) {
          setOrgProfile(null)
          setOrgMetadata(null)
          setPdsUrl(null)
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on groupDid string, not object ref
    [activeOrg?.groupDid]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  // Compute avatar/banner URLs using the org's PDS
  const effectivePdsUrl = pdsUrl || "https://certified.one"
  const orgAvatarUrl = orgProfile && activeOrg
    ? getAvatarUrl(orgProfile as CertifiedProfile, activeOrg.groupDid, effectivePdsUrl)
    : null
  const orgBannerUrl = orgProfile && activeOrg
    ? getBannerUrl(orgProfile as CertifiedProfile, activeOrg.groupDid, effectivePdsUrl)
    : null

  return { orgProfile, orgMetadata, orgAvatarUrl, orgBannerUrl, isLoading, refetch: fetchData }
}
