"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useParams, useSearchParams } from "next/navigation"
import { useProfileNavbar, usePageTitle, usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useOrgMarker } from "@/hooks/use-org-marker"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import {
  putProfile,
  uploadAvatar,
  uploadBanner,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import type {
  CertifiedProfile,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"
import ProfileHeader from "@/components/profile/profile-header"
import ProfileSidebar from "@/components/profile/profile-sidebar"
import ProfileOverview from "@/components/profile/profile-overview"
import ProfileEndorsements from "@/components/profile/profile-endorsements"
import ProfileProjects from "@/components/profile/profile-projects"
import ProfileCerts from "@/components/profile/profile-certs"
import ProfileGroups from "@/components/profile/profile-groups"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import { UserX } from "lucide-react"
import type { ProfileDrafts } from "@/components/profile/profile-inline-edit-types"

type TabKey =
  | "overview"
  | "certs"
  | "projects"
  | "groups"
  | "endorsements"

// Tab strip: Overview, Certs, Projects, Groups, Endorsements.
// Keep the order in sync with PROFILE_TABS in desktop-top-bar.tsx —
// that's the single source the user actually clicks on desktop.
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "certs", label: "Certs" },
  { key: "projects", label: "Projects" },
  { key: "groups", label: "Groups" },
  { key: "endorsements", label: "Endorsements" },
]

// `ProfileDrafts` lives in `profile-inline-edit-types` so the sidebar and
// overview can import it without creating a cycle with this page module.

export default function UserProfilePage() {
  useProfileNavbar()

  const params = useParams()
  const rawHandle = params.handle as string | undefined
  const handleOrDid = useMemo(
    () => (rawHandle ? decodeURIComponent(rawHandle) : null),
    [rawHandle]
  )

  const {
    profile,
    avatarUrl,
    bannerUrl,
    did,
    handle: resolvedHandle,
    isOwnProfile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useUserProfile(handleOrDid)

  const { isAuthenticated } = useAuth()

  const titleForTopBar =
    profile?.displayName || (resolvedHandle ? `@${resolvedHandle}` : "Profile")
  usePageTitle(titleForTopBar)
  // Single-part breadcrumb: `@handle` is the only segment, but it's
  // clickable. Matches the cert-page pattern (which uses two parts).
  usePageTitleBreadcrumb(
    resolvedHandle
      ? {
          left: {
            text: `@${resolvedHandle}`,
            href: `/profile/${encodeURIComponent(resolvedHandle)}`,
          },
        }
      : null,
  )

  // Detect the org marker on the viewed DID so the sidebar can switch into
  // org-mode (extra URL list). While loading we pass isOrg=false to keep
  // the sidebar in non-org mode; the hook caches per-DID so subsequent
  // visits hydrate synchronously.
  const { isOrg, additionalUrls, isLoading: isOrgMarkerLoading } =
    useOrgMarker(did)
  const sidebarIsOrg = isOrgMarkerLoading ? false : isOrg

  const { groups, isLoading: orgGroupsLoading } = useOrg()
  const memberOrg = did ? groups.find((g) => g.groupDid === did) : undefined
  const isAdminOfThisGroup =
    !!memberOrg && (memberOrg.role === "owner" || memberOrg.role === "admin")

  // Viewer can inline-edit on their own profile, OR when they admin the
  // group whose profile is being viewed. Group admins editing a group
  // hit a separate save path (BFF putOrgProfile + group-repo blob
  // uploads); see handlers below for the wiring.
  const canEditInline = isOwnProfile || isAdminOfThisGroup
  // The save/upload `targetDid` for inline edit. `undefined` keeps the
  // helpers on the personal session-DID path; setting it routes through
  // the group BFF endpoints instead.
  const editTargetDid = !isOwnProfile && isAdminOfThisGroup ? did : undefined

  // -------------------------------------------------------------------
  // Inline edit state
  // -------------------------------------------------------------------
  // We keep edit state local to the page so the sidebar and overview
  // can both swap into input mode in lockstep. Drafts are seeded from
  // `profile` when the user enters edit mode; on save we PUT the
  // profile record, update local profile/URL state, and exit edit mode.
  const [isEditing, setIsEditing] = useState(false)
  const [drafts, setDrafts] = useState<ProfileDrafts>({
    displayName: "",
    description: "",
    website: "",
  })
  // Local mirrors so the sidebar/overview show fresh values immediately
  // after save (without round-tripping through useUserProfile, which
  // doesn't expose a mutate(). The hook re-fetches on its own props
  // changing, so on a hard nav back to the page the canonical value
  // wins again.)
  const [localProfile, setLocalProfile] = useState<CertifiedProfile | null>(
    null,
  )
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null)
  const [localBannerUrl, setLocalBannerUrl] = useState<string | null>(null)
  const [pendingAvatarBlob, setPendingAvatarBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingBannerBlob, setPendingBannerBlob] =
    useState<UploadedBlob | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Effective values used everywhere the UI renders read-only content:
  // post-save overrides win, then the hook-supplied snapshot.
  const effectiveProfile = localProfile ?? profile
  const effectiveAvatarUrl = localAvatarUrl ?? avatarUrl
  const effectiveBannerUrl = localBannerUrl ?? bannerUrl

  const handleEditClick = useCallback(() => {
    if (!effectiveProfile) return
    setDrafts({
      displayName: effectiveProfile.displayName ?? "",
      description: effectiveProfile.description ?? "",
      website: effectiveProfile.website ?? "",
    })
    setPendingAvatarBlob(null)
    setPendingBannerBlob(null)
    setSaveError(null)
    setIsEditing(true)
  }, [effectiveProfile])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setPendingAvatarBlob(null)
    setPendingBannerBlob(null)
    setSaveError(null)
  }, [])

  const handleDraftChange = useCallback(
    <K extends keyof ProfileDrafts>(key: K, value: ProfileDrafts[K]) => {
      setDrafts((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const handleAvatarFile = useCallback(
    async (file: File) => {
      const blob = await uploadAvatar(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      setPendingAvatarBlob(blob)
    },
    [editTargetDid],
  )

  const handleBannerFile = useCallback(
    async (file: File) => {
      const blob = await uploadBanner(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      setPendingBannerBlob(blob)
    },
    [editTargetDid],
  )

  const handleSave = useCallback(async () => {
    if (!did || !isAuthenticated) {
      setSaveError("Not authenticated")
      return
    }
    const base = effectiveProfile ?? null
    const next: CertifiedProfile = {
      createdAt: base?.createdAt || new Date().toISOString(),
      ...(drafts.displayName.trim() && {
        displayName: drafts.displayName.trim(),
      }),
      ...(base?.pronouns && { pronouns: base.pronouns }),
      ...(drafts.description.trim() && {
        description: drafts.description.trim(),
      }),
      ...(drafts.website.trim() && { website: drafts.website.trim() }),
    }

    if (pendingAvatarBlob) {
      const avatarImage: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        image: pendingAvatarBlob as unknown as BlobRef,
      }
      next.avatar = avatarImage
    } else if (base?.avatar) {
      next.avatar = base.avatar
    }

    if (pendingBannerBlob) {
      const bannerImage: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        image: pendingBannerBlob as unknown as BlobRef,
      }
      next.banner = bannerImage
    } else if (base?.banner) {
      next.banner = base.banner
    }

    try {
      setIsSaving(true)
      setSaveError(null)
      await putProfile(
        did,
        next,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )

      // Defensive: evict any cached resolve-did response so navigation
      // back through the app sees the new record. Best-effort.
      fetch(`/api/resolve-did?did=${encodeURIComponent(did)}`, {
        cache: "reload",
        credentials: "include",
      }).catch(() => undefined)

      // Mirror the saved profile locally so the read-only render
      // immediately reflects the change without a hard reload.
      setLocalProfile(next)
      // Build CDN-style URLs for newly uploaded blobs. We don't know the
      // PDS host on the client without re-resolving, so fall back to the
      // existing URL on no-upload and clear-then-let-resolve-did rehydrate
      // when the blob changed. This is a known limitation — the new image
      // will appear after the next /api/resolve-did roundtrip.
      // TODO(profile-cdn-url): expose pdsUrl from useUserProfile so we
      // can synthesise the getBlob URL inline (avoids the brief flash).
      if (pendingAvatarBlob) setLocalAvatarUrl(null)
      if (pendingBannerBlob) setLocalBannerUrl(null)

      setPendingAvatarBlob(null)
      setPendingBannerBlob(null)
      setIsEditing(false)
    } catch (err) {
      console.error("Failed to save profile:", err)
      setSaveError(
        err instanceof Error ? err.message : "Failed to save profile",
      )
    } finally {
      setIsSaving(false)
    }
  }, [
    did,
    isAuthenticated,
    effectiveProfile,
    drafts,
    pendingAvatarBlob,
    pendingBannerBlob,
    editTargetDid,
  ])

  // Mobile <ProfileHeader> still uses the legacy edit pages as a
  // fallback (inline edit isn't wired on the compact mobile header
  // yet). Desktop sidebar handles inline-edit via the onEditClick
  // callback below — no editHref needed when canEditInline is true.
  const mobileEditHref = isOwnProfile
    ? "/settings/edit-profile"
    : isAdminOfThisGroup && did
      ? `/groups/${encodeURIComponent(did)}/edit-profile`
      : undefined

  const settingsHref =
    isAdminOfThisGroup && did
      ? `/groups/${encodeURIComponent(did)}/settings`
      : undefined

  const eyebrow = isOwnProfile
    ? "Your profile"
    : isAdminOfThisGroup
      ? "Admin of this group"
      : undefined

  const { activities, hasMore } = useUserActivities(did)
  const activityCountLabel = hasMore
    ? `${activities.length}+`
    : `${activities.length}`

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabFromUrl = useMemo<TabKey>(() => {
    const v = searchParams?.get("tab")
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : "overview"
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)

  if (tabFromUrl !== activeTab && TABS.some((t) => t.key === tabFromUrl)) {
    setActiveTab(tabFromUrl)
  }

  if (isProfileLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (profileError || !did) {
    return (
      <EmptyState
        icon={UserX}
        title="Profile not found"
        description={`We couldn't find a Certified profile for ${handleOrDid ? `@${handleOrDid}` : "this user"}.`}
        className="pt-[120px]"
      />
    )
  }

  const editing = isEditing && canEditInline

  return (
    <div className="profile-page">
      {/* Mobile-only identity block. Hidden on desktop where the sidebar
          carries the identity. The desktop top bar's row 2 is the only
          tab strip; there is no in-page tab strip. */}
      <div className="profile-page__mobile-header">
        <ProfileHeader
          profile={effectiveProfile}
          avatarUrl={effectiveAvatarUrl}
          bannerUrl={effectiveBannerUrl}
          handle={resolvedHandle || (rawHandle ?? null)}
          did={did}
          activityCountLabel={activityCountLabel}
          editHref={mobileEditHref}
          settingsHref={settingsHref}
          eyebrow={eyebrow}
        />
      </div>

      {editing ? (
        <div className="profile-edit-banner" role="region" aria-label="Edit profile">
          <span className="profile-edit-banner__label">Editing profile</span>
          {saveError ? (
            <span className="profile-edit-banner__error" role="alert">
              {saveError}
            </span>
          ) : null}
          <div className="profile-edit-banner__actions">
            <button
              type="button"
              className="profile-edit-banner__btn"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="profile-edit-banner__btn profile-edit-banner__btn--primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="profile-page__layout">
        <ProfileSidebar
          profile={effectiveProfile}
          avatarUrl={effectiveAvatarUrl}
          handle={resolvedHandle || (rawHandle ?? null)}
          did={did}
          basePath={pathname || ""}
          settingsHref={settingsHref}
          isOrg={sidebarIsOrg}
          additionalUrls={additionalUrls}
          groupsOverride={isOwnProfile ? groups : undefined}
          groupsLoadingOverride={isOwnProfile ? orgGroupsLoading : undefined}
          canInlineEdit={canEditInline}
          isEditing={editing}
          drafts={drafts}
          onEditClick={handleEditClick}
          onCancelEdit={handleCancelEdit}
          onSaveEdit={handleSave}
          onDraftChange={handleDraftChange}
          onAvatarFile={handleAvatarFile}
          hasPendingAvatar={!!pendingAvatarBlob}
          isSaving={isSaving}
          saveError={saveError}
        />

        <div className="profile-page__main">
          {activeTab === "overview" && (
            <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
              <ProfileOverview
                bannerUrl={effectiveBannerUrl}
                did={did}
                profile={effectiveProfile}
                basePath={pathname || ""}
                isEditing={editing}
                drafts={drafts}
                onDraftChange={handleDraftChange}
                onBannerFile={handleBannerFile}
                hasPendingBanner={!!pendingBannerBlob}
              />
            </div>
          )}
          {activeTab === "certs" && (
            <div
              role="tabpanel"
              id="tabpanel-certs"
              aria-labelledby="tab-certs"
            >
              <ProfileCerts did={did} />
            </div>
          )}
          {activeTab === "projects" && (
            <div
              role="tabpanel"
              id="tabpanel-projects"
              aria-labelledby="tab-projects"
            >
              <ProfileProjects did={did} />
            </div>
          )}
          {activeTab === "groups" && (
            <div
              role="tabpanel"
              id="tabpanel-groups"
              aria-labelledby="tab-groups"
            >
              <ProfileGroups did={did} />
            </div>
          )}
          {activeTab === "endorsements" && (
            <div
              role="tabpanel"
              id="tabpanel-endorsements"
              aria-labelledby="tab-endorsements"
            >
              <ProfileEndorsements did={did} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
