"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { getOrgProfile, putOrgProfile, getOrgMetadata, putOrgMetadata, uploadOrgBlob } from "@/lib/groups/api"
import { resolvePdsUrl } from "@/lib/atproto/did"
import { DEFAULT_PDS_URL } from "@/lib/utils/config"
import { getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile"
import type { OrgProfile, GroupMetadata } from "@/lib/groups/types"
import type { HypercertsSmallImage, HypercertsLargeImage } from "@/lib/atproto/types"
import type { UploadedBlob } from "@/lib/atproto/profile"
import type { BlobRef } from "@atproto/api"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import AvatarUpload from "@/components/profile/avatar-upload"
import BannerUpload from "@/components/profile/banner-upload"
import { getInitials } from "@/lib/utils/initials"

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
  const [avatarBlob, setAvatarBlob] = useState<UploadedBlob | null>(null)
  const [bannerBlob, setBannerBlob] = useState<UploadedBlob | null>(null)
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
  const effectivePdsUrl = pdsUrl || DEFAULT_PDS_URL
  const currentAvatarUrl = profile
    ? getAvatarUrl(profile, groupDid, effectivePdsUrl)
    : null
  const currentBannerUrl = profile
    ? getBannerUrl(profile, groupDid, effectivePdsUrl)
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

  // getInitials returns lowercase chars from the displayName; the
  // <Avatar> primitive uppercases via .toUpperCase() before render.
  // Fallback "O" preserves the prior behavior when no displayName yet.
  const fallbackInitials = displayName ? getInitials(displayName) : "O"

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

      // Handle avatar. UploadedBlob is structurally compatible with the
      // lexicon BlobRef shape; one cast at this seam, not two.
      if (avatarBlob) {
        const avatarImage: HypercertsSmallImage = {
          $type: "org.hypercerts.defs#smallImage",
          image: avatarBlob as unknown as BlobRef,
        }
        updatedProfile.avatar = avatarImage
      } else if (profile?.avatar) {
        updatedProfile.avatar = profile.avatar
      }

      // Handle banner
      if (bannerBlob) {
        const bannerImage: HypercertsLargeImage = {
          $type: "org.hypercerts.defs#largeImage",
          image: bannerBlob as unknown as BlobRef,
        }
        updatedProfile.banner = bannerImage
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

      // Defensive cache eviction — see the matching note in the
      // personal edit-profile handler. Targets resolve-did for the
      // group DID so the profile hero shows the new record after the
      // server-redirect lands on /profile/<group-handle>.
      await fetch(`/api/resolve-did?did=${encodeURIComponent(groupDid)}`, {
        cache: "reload",
        credentials: "include",
      }).catch(() => undefined)
      // Hard reload to the group profile so every cache layer (org
      // profile fetch, blob URLs on the hero) picks up the freshly-
      // saved record. /groups/<did> server-redirects to /profile/<handle>.
      window.location.assign(`/groups/${encodeURIComponent(groupDid)}`)
      return
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
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
                  <Button
                    variant="ghost"
                    onClick={() => router.push(`/groups/${encodeURIComponent(groupDid)}`)}
                    disabled={isSaving}
                  >
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
