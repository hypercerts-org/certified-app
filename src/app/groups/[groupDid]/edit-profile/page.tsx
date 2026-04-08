"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { getOrgProfile, putOrgProfile, getOrgMetadata, putOrgMetadata, uploadOrgBlob } from "@/lib/groups/api"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile"
import type { OrgProfile, GroupMetadata } from "@/lib/groups/types"
import type { CertifiedProfile, HypercertsSmallImage, HypercertsLargeImage } from "@/lib/atproto/types"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import AvatarUpload from "@/components/profile/avatar-upload"
import BannerUpload from "@/components/profile/banner-upload"

export default function EditOrgProfilePage() {
  const router = useRouter()
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)

  const [profile, setProfile] = useState<OrgProfile | null>(null)
  const [metadata, setMetadata] = useState<GroupMetadata | null>(null)
  const [pdsUrl, setPdsUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Profile fields
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [website, setWebsite] = useState("")

  // Group metadata fields
  const [foundedDate, setFoundedDate] = useState("")

  // Image upload state
  const [avatarBlob, setAvatarBlob] = useState<Record<string, unknown> | null>(null)
  const [bannerBlob, setBannerBlob] = useState<Record<string, unknown> | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true)
      const [p, m, resolvedPds] = await Promise.all([
        getOrgProfile(groupDid, signal).catch(() => null),
        getOrgMetadata(groupDid, signal).catch(() => null),
        resolvePdsUrl(groupDid).catch(() => null),
      ])
      if (!signal?.aborted) {
        setProfile(p)
        setMetadata(m)
        setPdsUrl(resolvedPds)
        setDisplayName(p?.displayName || "")
        setDescription(p?.description || "")
        setWebsite(p?.website || "")
        if (m?.foundedDate) {
          setFoundedDate(m.foundedDate.split("T")[0])
        }
      }
    } catch {
      // ignore
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [groupDid])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  // Compute current avatar/banner URLs from the profile
  const effectivePdsUrl = pdsUrl || process.env.NEXT_PUBLIC_PDS_URL || "https://certified.one"
  const currentAvatarUrl = profile
    ? getAvatarUrl(profile as CertifiedProfile, groupDid, effectivePdsUrl)
    : null
  const currentBannerUrl = profile
    ? getBannerUrl(profile as CertifiedProfile, groupDid, effectivePdsUrl)
    : null

  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true)
    try {
      const blobRef = await uploadOrgBlob(groupDid, file)
      setAvatarBlob(blobRef)
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true)
    try {
      const blobRef = await uploadOrgBlob(groupDid, file)
      setBannerBlob(blobRef)
    } finally {
      setIsUploadingBanner(false)
    }
  }

  const fallbackInitials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : "O"

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      // Build profile update
      const updatedProfile: OrgProfile = {
        createdAt: profile?.createdAt || new Date().toISOString(),
        ...(displayName.trim() && { displayName: displayName.trim() }),
        ...(description.trim() && { description: description.trim() }),
        ...(website.trim() && { website: website.trim() }),
      }

      // Handle avatar
      if (avatarBlob) {
        updatedProfile.avatar = {
          $type: "org.hypercerts.defs#smallImage",
          image: avatarBlob,
        } as unknown
      } else if (profile?.avatar) {
        updatedProfile.avatar = profile.avatar
      }

      // Handle banner
      if (bannerBlob) {
        updatedProfile.banner = {
          $type: "org.hypercerts.defs#largeImage",
          image: bannerBlob,
        } as unknown
      } else if (profile?.banner) {
        updatedProfile.banner = profile.banner
      }

      // Build metadata update
      const updatedMetadata: GroupMetadata = {
        createdAt: metadata?.createdAt || new Date().toISOString(),
        ...(metadata?.organizationType && { organizationType: metadata.organizationType }),
        ...(metadata?.urls && { urls: metadata.urls }),
        ...(metadata?.location && { location: metadata.location }),
        ...(foundedDate && { foundedDate: new Date(foundedDate).toISOString() }),
      }

      await Promise.all([
        putOrgProfile(groupDid, updatedProfile),
        putOrgMetadata(groupDid, updatedMetadata),
      ])

      router.push("/")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Edit</h1>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {isLoading ? (
            <div className="edit-profile__loading">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="edit-profile">
              {/* Banner + avatar — mirrors profile page layout */}
              <div className="dash-card">
                <BannerUpload
                  currentBannerUrl={currentBannerUrl}
                  onUpload={handleBannerUpload}
                  isUploading={isUploadingBanner}
                />
                <div className="edit-profile__avatar-row">
                  <AvatarUpload
                    currentAvatarUrl={currentAvatarUrl}
                    fallbackInitials={fallbackInitials}
                    onUpload={handleAvatarUpload}
                    isUploading={isUploadingAvatar}
                  />
                  <div className="edit-profile__name-field">
                    <Input
                      label="Display name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={64}
                      placeholder="Group name"
                    />
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div className="dash-card">
                <div className="edit-profile__fields">
                  <div>
                    <Textarea
                      label="About"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      maxLength={256}
                      placeholder="Describe your group"
                    />
                    <div className="edit-profile__char-count">
                      {description.length}/256 characters
                    </div>
                  </div>
                  <Input
                    label="Website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    maxLength={256}
                    placeholder="https://example.org"
                  />
                  <Input
                    label="Founded date"
                    type="date"
                    value={foundedDate}
                    onChange={(e) => setFoundedDate(e.target.value)}
                  />
                </div>

                {saveError && <ErrorMessage message={saveError} />}

                <div className="edit-profile__actions">
                  <Button variant="ghost" onClick={() => router.push("/")} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
