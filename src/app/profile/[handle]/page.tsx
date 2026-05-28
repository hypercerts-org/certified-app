"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useParams, useSearchParams } from "next/navigation"
import {
  useProfileNavbar,
  usePageTitle,
  usePageTitleBreadcrumb,
  useProfileAboutAvailable,
  useProfileGroupsAvailable,
} from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
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
  | "certs"
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
  { key: "certs", label: "Certs" },
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
            href: `/profile/${encodeURIComponent(resolvedHandle)}`,
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
    profile,
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
            {activeTab === "certs" && (
              <div
                role="tabpanel"
                id="tabpanel-certs"
                aria-labelledby="tab-certs"
              >
                <ProfileCerts did={did} viewerIsOwner={isViewerThisEntity} />
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
