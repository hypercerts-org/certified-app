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
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import AvatarUpload from "@/components/profile/avatar-upload"
import BannerUpload from "@/components/profile/banner-upload"
import FormActionBar from "@/components/create/form-action-bar"
import {
  GroupAccessPage,
  GroupRoleRequired,
  useGroupAccess,
} from "@/components/groups/group-access"
import { getInitials } from "@/lib/utils/initials"
import { profileUrl } from "@/lib/urls"
import { usePageTitle } from "@/lib/navbar-context"
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"

export default function EditOrgProfilePage() {
  usePageTitle("Edit group profile")
  const router = useRouter()
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  // Signed in + member (see the gate before the form below). Only owners
  // and admins can write the profile; the form's reads wait for that too.
  const access = useGroupAccess(groupDid)
  const canEdit =
    access.status === "member" &&
    (access.org.role === "owner" || access.org.role === "admin")

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
  // Any field edit / upload marks the form dirty (seeding from the
  // fetched record goes through the setters directly, not onChange).
  const [hasInteracted, setHasInteracted] = useState(false)
  const { confirmDiscard } = useUnsavedChangesGuard(hasInteracted && !isSaving)

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
    if (!canEdit) return
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData, canEdit])

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
      setHasInteracted(true)
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true)
    try {
      const blobRef = await uploadOrgBlob(groupDid, file)
      setBannerBlob(blobRef)
      setHasInteracted(true)
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
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard reload, see above
      window.location.assign(`/groups/${encodeURIComponent(groupDid)}`)
      return
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
      setIsSaving(false)
    }
  }

  // Same gate as the settings page: signed in and a member of the group.
  // Writing the profile also needs an owner or admin role.
  if (access.status !== "member") {
    return (
      <GroupAccessPage
        access={access}
        groupDid={groupDid}
        title="Edit group profile"
        signedOutTitle="Sign in to edit this group"
        signedOutDescription="Only the group's owners and admins can edit its profile."
      />
    )
  }

  if (!canEdit) {
    return (
      <GroupRoleRequired
        groupDid={groupDid}
        title="Edit group profile"
        description="Ask an owner or admin of this group to change its profile."
      />
    )
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        back={{ href: profileUrl(groupDid), label: "Group profile" }}
        title="Edit group profile"
        description="The group's name, picture and details, as others see them."
      />
      {isLoading ? (
        <div className="edit-profile__loading">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        // A real <form> so Enter in a field submits.
        <form
          className="edit-profile"
          noValidate
          onInput={() => setHasInteracted(true)}
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
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
          </div>

          {/* No "Saving as" line: the profile is written to the group
              whichever account you are acting as. */}
          <FormActionBar
            submitLabel="Save changes"
            submittingLabel="Saving…"
            isSubmitting={isSaving}
            error={saveError}
            identityLabel={null}
            onCancel={() => {
              if (confirmDiscard()) router.push(`/groups/${encodeURIComponent(groupDid)}`)
            }}
          />
        </form>
      )}
    </PageContainer>
  )
}
