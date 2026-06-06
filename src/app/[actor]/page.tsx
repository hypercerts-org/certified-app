"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useParams, useSearchParams, useRouter } from "next/navigation"
import { profileUrl } from "@/lib/urls"
import {
  useProfileNavbar,
  usePageTitle,
  usePageTitleBreadcrumb,
  useProfileAboutAvailable,
  useProfileGroupsAvailable,
} from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { getProfileWithCid } from "@/lib/atproto/profile"
import type { CertifiedProfile } from "@/lib/atproto/types"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useOrgMarker } from "@/hooks/use-org-marker"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import { useProfileInlineEdit } from "@/hooks/use-profile-inline-edit"
import ProfileHeader from "@/components/profile/profile-header"
import ProfileSidebar from "@/components/profile/profile-sidebar"
import ProfileOverview from "@/components/profile/profile-overview"
import ProfileEndorsements from "@/components/profile/profile-endorsements"
import ProfileFollowers from "@/components/profile/profile-followers"
import ProfileLists from "@/components/profile/profile-lists"
import ProfileProjects from "@/components/profile/profile-projects"
import ProfileCerts from "@/components/profile/profile-certs"
import ProfileGroups from "@/components/profile/profile-groups"
import SettingsPanel from "@/components/settings/settings-panel"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import type { LinearDocument } from "@/lib/leaflet/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EditBanner from "@/components/ui/edit-banner"
import EmptyState from "@/components/ui/empty-state"
import OnboardingBanner from "@/components/onboarding/onboarding-banner"
import { AlignLeft, UserX } from "lucide-react"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

type TabKey =
  | "overview"
  | "about"
  | "activities"
  | "projects"
  | "groups"
  | "endorsements"
  | "followers"
  | "lists"
  | "settings"

// Tab strip order — keep in sync with PROFILE_TABS in
// desktop-top-bar.tsx, which is the single source the user clicks on
// desktop. About sits right after Overview and only renders when the
// viewed profile carries a non-empty `longDescription`; Settings is
// own-profile only.
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "groups", label: "Groups" },
  { key: "endorsements", label: "Endorsements" },
  { key: "followers", label: "Followers" },
  { key: "lists", label: "Lists" },
  { key: "about", label: "About" },
  { key: "settings", label: "Settings" },
]

// Inline-edit state machine + display helpers live in
// `useProfileInlineEdit` so the page reads as orchestration + tab
// rendering only. The `ParsedLocation` type and helper functions
// (parseLocation, readableOrgTypeTags, readableFoundedDate, etc.)
// are exported from that hook for downstream components that still
// need the shapes.

export default function UserProfilePage() {
  useProfileNavbar()

  const params = useParams()
  const router = useRouter()
  const rawHandle = params.actor as string | undefined
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
    hasCertifiedProfile,
  } = useUserProfile(handleOrDid)

  const { isAuthenticated, did: sessionDid } = useAuth()

  const titleForTopBar =
    profile?.displayName || resolvedHandle || "Profile"
  usePageTitle(titleForTopBar)
  // Single-part breadcrumb: the handle (without the `@` sigil) is the
  // only segment, but it's clickable. Matches the cert-page pattern
  // (which uses two parts).
  usePageTitleBreadcrumb(
    resolvedHandle
      ? {
          left: {
            text: resolvedHandle,
            href: profileUrl(resolvedHandle),
          },
        }
      : null,
  )

  // Detect the org marker on the viewed DID so the sidebar can switch into
  // org-mode (extra URL list). While loading we pass isOrg=false to keep
  // the sidebar in non-org mode; the hook caches per-DID so subsequent
  // visits hydrate synchronously.
  const {
    isOrg,
    additionalUrls,
    urls: orgUrls,
    marker: orgMarker,
    isLoading: isOrgMarkerLoading,
    refresh: refreshOrgMarker,
  } = useOrgMarker(did)
  const sidebarIsOrg = isOrgMarkerLoading ? false : isOrg

  // Recently-viewed: record the viewed DID once it resolves so the
  // /explore "Recently viewed" filter (Accounts kind) can surface this
  // profile later. Foreign profiles only — skip own-profile views to
  // avoid the user's own DID dominating their own recents list.
  useEffect(() => {
    if (did && !isOwnProfile) trackRecentlyViewed("user", did)
  }, [did, isOwnProfile])

  const { activeOrg, groups } = useOrg()
  const memberOrg = did ? groups.find((g) => g.groupDid === did) : undefined
  const isAdminOfThisGroup =
    !!memberOrg && (memberOrg.role === "owner" || memberOrg.role === "admin")

  // Inline-edit is gated on the *active session identity* exactly
  // matching the viewed profile — being an admin of a group is not
  // enough; the user must be currently acting as that group (or as
  // themselves on their own profile). This means:
  //   - Own profile: only when no org is currently active.
  //   - Group profile: only when activeOrg.groupDid === viewed DID.
  // Group admins who want to edit a group switch into it from the
  // account switcher.
  const isActingAsThisGroup =
    !!activeOrg && !!did && activeOrg.groupDid === did
  const canEditInline =
    (isOwnProfile && !activeOrg) || isActingAsThisGroup
  // The save/upload `targetDid` for inline edit. `undefined` keeps the
  // helpers on the personal session-DID path; setting it routes through
  // the group BFF endpoints instead.
  const editTargetDid = isActingAsThisGroup ? did : undefined

  // -------------------------------------------------------------------
  // Editable-base source for inline edit.
  //
  // `useUserProfile` resolves the DISPLAY profile via /api/resolve-did,
  // which carries no avatar/banner blob refs (only resolved URLs). If
  // that avatar-less snapshot were fed to useProfileInlineEdit, a
  // TEXT-ONLY save (no fresh upload) would write the profile record
  // WITHOUT the existing avatar/banner blobs — silently deleting them
  // (the data-loss bug). The /settings/edit-profile surface avoids this
  // by sourcing its base from the RAW certs record via getProfile(did),
  // which DOES carry the blob refs; we mirror that here.
  //
  // Gated behind `canEditInline` so foreign / read-only views don't pay
  // for the extra getRecord. A 404 (brand-new user with no certs record)
  // yields null — fine, there's no avatar to preserve. We also capture
  // the record CID as the swapRecord precondition (judgment-006 / #71).
  // State holds the LAST successful fetch for the currently-eligible
  // (did, canEditInline) pair. We never synchronously reset it inside
  // the effect (that trips the set-state-in-effect lint rule); instead
  // we track which DID the held value belongs to and gate consumption
  // below so a stale value from a previous DID / view is never used.
  const [editBaseFetch, setEditBaseFetch] = useState<{
    did: string
    profile: CertifiedProfile | null
    cid: string | null
  } | null>(null)
  useEffect(() => {
    if (!canEditInline || !did) return
    const controller = new AbortController()
    const targetDid = did
    getProfileWithCid(targetDid, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setEditBaseFetch({
          did: targetDid,
          profile: res?.value ?? null,
          cid: res?.cid ?? null,
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setEditBaseFetch({ did: targetDid, profile: null, cid: null })
      })
    return () => controller.abort()
  }, [canEditInline, did])
  // Only honor the held fetch when it matches the currently-viewed DID
  // and the view is editable — otherwise treat the base as not-yet-known
  // (null), so a foreign / read-only view never sees a previous editable
  // record's blob refs or CID.
  const editBaseValid =
    canEditInline && !!did && editBaseFetch?.did === did
  const editBaseProfile = editBaseValid ? editBaseFetch!.profile : null
  const editBaseProfileCid = editBaseValid ? editBaseFetch!.cid : null

  // -------------------------------------------------------------------
  // Inline edit state — owned by useProfileInlineEdit. The hook holds
  // drafts, pending uploads, post-save local mirrors, the two-write
  // save path (profile + org marker + location), and installs a
  // document-level unsaved-changes guard while the user is mid-edit.
  // This page owns navbar publishes (about/groups availability) and
  // tab rendering only.
  // -------------------------------------------------------------------
  const inlineEdit = useProfileInlineEdit({
    did,
    sessionDid,
    isAuthenticated,
    canEditInline,
    editTargetDid,
    sidebarIsOrg,
    // Editable views feed the RAW certs record (carries avatar/banner
    // blob refs) so a text-only save preserves them; read-only views
    // keep the resolved useUserProfile snapshot for display. While the
    // raw fetch is in flight we fall back to the resolved profile so the
    // edit button isn't disabled (handleEditClick no-ops on a null base).
    profile: canEditInline ? (editBaseProfile ?? profile) : profile,
    profileCid: canEditInline ? editBaseProfileCid : null,
    avatarUrl,
    bannerUrl,
    orgMarker,
    refreshOrgMarker,
    orgUrls,
    additionalUrls,
  })
  const {
    isEditing,
    drafts,
    isSaving,
    saveError,
    hasPendingAvatar,
    hasPendingBanner,
    effectiveProfile,
    effectiveAvatarUrl,
    effectiveBannerUrl,
    effectiveOrgMarker,
    effectiveOrgUrls,
    effectiveAdditionalUrls,
    displayOrgTypeTags,
    displayLocation,
    displayFoundedDate,
    displayLongDescription,
    handleEditClick,
    handleCancelEdit,
    handleDraftChange,
    handleAvatarFile,
    handleBannerFile,
    handleRemoveBanner,
    handleLongDescImageUpload,
    handleSave,
  } = inlineEdit

  // -------------------------------------------------------------------
  // Navbar tab availability — depends on hook outputs + page-level
  // facts (own-vs-foreign, public group memberships).
  // -------------------------------------------------------------------
  // About tab is org-only — individual profiles never expose it, even
  // when the viewer is the profile owner. Groups still surface it
  // when they have content OR when an admin can edit / is editing.
  const aboutEditingForOrg = isEditing && canEditInline && sidebarIsOrg
  const isViewerThisEntity = isOwnProfile || isActingAsThisGroup
  useProfileAboutAvailable(
    sidebarIsOrg &&
      (!!displayLongDescription || isViewerThisEntity || aboutEditingForOrg),
  )
  // Gate the Groups tab: only visible when the viewer's currently
  // *active* identity matches the viewed profile. So the personal
  // user sees it on their own profile only when no org is active;
  // a group sees it on its own profile only while acting as that
  // group. A user acting as a group must NOT see the Groups tab
  // on their personal profile — the group is the active identity,
  // and the CGS endpoint returns the group's memberships in that
  // session, not the personal user's.
  const isActiveIdentityThisProfile =
    (isOwnProfile && !activeOrg) || isActingAsThisGroup
  useProfileGroupsAvailable(isActiveIdentityThisProfile)

  // Mobile <ProfileHeader> still uses the legacy edit pages as a
  // fallback (inline edit isn't wired on the compact mobile header
  // yet). Same gate as `canEditInline` above — the signed-in identity
  // must match the viewed profile exactly.
  const mobileEditHref =
    isOwnProfile && !activeOrg
      ? "/settings/edit-profile"
      : isActingAsThisGroup && did
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
    const raw = searchParams?.get("tab")
    // Migration shim — the legacy ?tab=certs slug resolves to activities
    // so old links / bookmarks keep working.
    const v = raw === "certs" ? "activities" : raw
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : "overview"
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)

  // Canonicalize the address bar to the handle form. When the profile was
  // opened by its durable DID (e.g. a shared link), swap to `/{handle}` once
  // the handle resolves — preserving any ?tab= query. The DID can't rot, so
  // the link stays correct; the handle is just the pretty display form.
  useEffect(() => {
    if (!handleOrDid || !resolvedHandle) return
    if (handleOrDid.startsWith("did:") && resolvedHandle !== handleOrDid) {
      const qs = searchParams?.toString()
      router.replace(profileUrl(resolvedHandle) + (qs ? `?${qs}` : ""))
    }
  }, [handleOrDid, resolvedHandle, searchParams, router])

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
          hasCertifiedProfile={hasCertifiedProfile}
        />
      </div>

      {editing ? (
        <EditBanner
          label="Editing profile"
          error={saveError}
          isSaving={isSaving}
          onCancel={handleCancelEdit}
          onSave={handleSave}
        />
      ) : null}

      {/* Re-entry banner — only renders on the viewer's OWN profile
          when the OnboardingContext gate holds (bsky profile present,
          no certified profile yet). Internally self-gating. */}
      {isOwnProfile && !activeOrg ? <OnboardingBanner /> : null}

      {activeTab === "settings" && isViewerThisEntity ? (
        // Settings tab swaps the entire profile-page two-pane layout
        // out for the settings panel's own menu+sections two-pane
        // layout — same 296px slim rail, but the left pane carries
        // settings categories (Username / Email / Password /
        // Appearance) instead of the profile identity sidebar.
        <SettingsPanel />
      ) : (
        <div className="page-layout">
          <ProfileSidebar
            profile={effectiveProfile}
            avatarUrl={effectiveAvatarUrl}
            handle={resolvedHandle || (rawHandle ?? null)}
            did={did}
            basePath={pathname || ""}
            settingsHref={settingsHref}
            isOrg={sidebarIsOrg}
            additionalUrls={effectiveAdditionalUrls}
            hasCertifiedProfile={hasCertifiedProfile}
            orgFoundedDate={displayFoundedDate}
            canInlineEdit={canEditInline}
            isEditing={editing}
            drafts={drafts}
            onEditClick={handleEditClick}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSave}
            onDraftChange={handleDraftChange}
            onAvatarFile={handleAvatarFile}
            hasPendingAvatar={hasPendingAvatar}
            isSaving={isSaving}
            saveError={saveError}
          />

          <div className="page-layout__main">
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
                  onBannerRemove={handleRemoveBanner}
                  hasPendingBanner={hasPendingBanner}
                  isOrg={sidebarIsOrg}
                  orgLongDescription={displayLongDescription}
                  orgTypeTags={displayOrgTypeTags}
                  orgLocationName={displayLocation.name}
                  orgLocationCoords={displayLocation.coords}
                />
              </div>
            )}
            {activeTab === "about" ? (
              <div
                role="tabpanel"
                id="tabpanel-about"
                aria-labelledby="tab-about"
                className="profile-page__about"
              >
                {editing && sidebarIsOrg ? (
                  <LeafletEditor
                    value={drafts.longDescription ?? null}
                    onChange={(next: LinearDocument) =>
                      handleDraftChange("longDescription", next)
                    }
                    placeholder="A longer, multi-line description of this organization."
                    ariaLabel="Long description"
                    did={did}
                    onImageUpload={handleLongDescImageUpload}
                  />
                ) : displayLongDescription ? (
                  <LeafletDocument
                    value={displayLongDescription}
                    did={did}
                    className="profile-page__about-doc"
                  />
                ) : isViewerThisEntity ? (
                  /* Empty About tab, but the viewer is signed in as
                     this entity — show the prompt to click "Edit
                     profile". Foreign viewers don't reach this branch
                     because the tab gate hides the About tab when
                     there's no content for them. */
                  <EmptyState
                    icon={AlignLeft}
                    title="Nothing here yet"
                    description="Click Edit profile to add an About section to your profile."
                  />
                ) : null}
              </div>
            ) : null}
            {activeTab === "activities" && (
              <div
                role="tabpanel"
                id="tabpanel-activities"
                aria-labelledby="tab-activities"
              >
                <ProfileCerts
                  did={did}
                  viewerIsOwner={isViewerThisEntity}
                  aggregateOwned={isOwnProfile && !activeOrg}
                />
              </div>
            )}
            {activeTab === "projects" && (
              <div
                role="tabpanel"
                id="tabpanel-projects"
                aria-labelledby="tab-projects"
              >
                <ProfileProjects
                  did={did}
                  viewerIsOwner={isViewerThisEntity}
                  aggregateOwned={isOwnProfile && !activeOrg}
                />
              </div>
            )}
            {activeTab === "groups" && isActiveIdentityThisProfile && (
              <div
                role="tabpanel"
                id="tabpanel-groups"
                aria-labelledby="tab-groups"
              >
                <ProfileGroups did={did} />
              </div>
            )}
            {activeTab === "endorsements" && did && (
              <div
                role="tabpanel"
                id="tabpanel-endorsements"
                aria-labelledby="tab-endorsements"
              >
                <ProfileEndorsements did={did} />
              </div>
            )}
            {activeTab === "followers" && did && (
              <div
                role="tabpanel"
                id="tabpanel-followers"
                aria-labelledby="tab-followers"
              >
                <ProfileFollowers did={did} />
              </div>
            )}
            {activeTab === "lists" && did && (
              <div
                role="tabpanel"
                id="tabpanel-lists"
                aria-labelledby="tab-lists"
              >
                <ProfileLists did={did} viewerIsOwner={isViewerThisEntity} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
