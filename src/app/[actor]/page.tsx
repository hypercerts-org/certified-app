"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useParams, useSearchParams, useRouter } from "next/navigation"
import { profileUrl } from "@/lib/urls"
import { usePageTitle, usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { getProfileWithCid } from "@/lib/atproto/profile"
import type { CertifiedProfile } from "@/lib/atproto/types"
import { useOrgMarker } from "@/hooks/use-org-marker"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import { useProfileInlineEdit } from "@/hooks/use-profile-inline-edit"
import dynamic from "next/dynamic"
import ProfileHeader, {
  ProfileHeaderSkeleton,
} from "@/components/profile/profile-header"
import ProfileOwnerBar from "@/components/profile/profile-owner-bar"
import ProfileTabs, { type ProfileTabItem } from "@/components/profile/profile-tabs"
import ProfileOverview from "@/components/profile/profile-overview"
import ProfileProjects from "@/components/profile/profile-projects"
import ProfileCerts from "@/components/profile/profile-certs"
import ProfileGroups from "@/components/profile/profile-groups"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
import type { LinearDocument } from "@/lib/leaflet/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EditBanner from "@/components/ui/edit-banner"
import EmptyState from "@/components/ui/empty-state"
import PageContainer from "@/components/ui/page-container"
import { Tabs, TabPanel } from "@/components/ui/tabs"
import NotFoundMarker from "@/components/layout/not-found-marker"
import Button from "@/components/ui/button"
import { TabPanelTransition } from "@/components/ui/tab-panel-transition"
import OnboardingBanner from "@/components/onboarding/onboarding-banner"
import { AlignLeft, Pencil, UserX } from "lucide-react"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

// Non-default tab panels are code-split out of the route's first-load
// chunk: profiles are the most-shared public URL, and anonymous visitors
// land on the Overview tab, so they should not download the endorsement /
// list / follower panels up front. Overview and the header stay static.
const ProfileEndorsements = dynamic(
  () => import("@/components/profile/profile-endorsements"),
  { loading: () => <LoadingSpinner /> },
)
const ProfileFollowers = dynamic(
  () => import("@/components/profile/profile-followers"),
  { loading: () => <LoadingSpinner /> },
)
const ProfileLists = dynamic(
  () => import("@/components/profile/profile-lists"),
  { loading: () => <LoadingSpinner /> },
)

type TabKey =
  | "overview"
  | "about"
  | "activities"
  | "projects"
  | "groups"
  | "endorsements"
  | "followers"
  | "lists"

// Tab strip order. About (organizations only) sits next to Overview;
// Groups shows only while the viewer's active identity is this account.
// Other pages link to these keys as `?tab=…`, so keep them stable. The
// old `?tab=settings` panel is gone: that link now goes to Settings.
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "about", label: "About" },
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "groups", label: "Groups" },
  { key: "endorsements", label: "Endorsements" },
  { key: "followers", label: "Followers" },
  { key: "lists", label: "Lists" },
]

// Left-to-right key order for the desktop tab-switch slide direction.
const TAB_ORDER = TABS.map((t) => t.key)

// Query params that belong to one tab's panel (sub-views, view mode, the
// open list). Switching tabs drops them so they don't leak across.
const PANEL_PARAMS = ["tab", "sub", "view", "list"]

export default function UserProfilePage() {
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
    hasBlueskyProfile,
  } = useUserProfile(handleOrDid)

  const { isAuthenticated, isLoading: isAuthLoading, did: sessionDid } = useAuth()

  // The phone top bar's compact title (and the chrome's fallback h1 while
  // the header is loading); the header's name is the page's h1.
  const titleForTopBar =
    profile?.displayName || resolvedHandle || "Profile"
  usePageTitle(titleForTopBar)
  // Single-part breadcrumb: the handle (without the `@` sigil), clickable.
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

  // Detect the org marker on the viewed DID so the header and Overview
  // switch into organization mode. While loading we treat the profile as a
  // person; the hook caches per DID so later visits hydrate synchronously.
  const {
    isOrg,
    additionalUrls,
    urls: orgUrls,
    marker: orgMarker,
    isLoading: isOrgMarkerLoading,
    refresh: refreshOrgMarker,
  } = useOrgMarker(did)
  const viewIsOrg = isOrgMarkerLoading ? false : isOrg

  // Recently-viewed: record the viewed DID once it resolves so the
  // /explore "Recently viewed" filter (Accounts kind) can surface this
  // profile later. Foreign profiles only — skip own-profile views to
  // avoid the user's own DID dominating their own recents list.
  useEffect(() => {
    if (did && !isOwnProfile) trackRecentlyViewed("user", did)
  }, [did, isOwnProfile])

  const { activeOrg, groups, isLoading: isOrgsLoading } = useOrg()
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
    sidebarIsOrg: viewIsOrg,
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
    inlineLocation,
    resolvedLocationRef,
    handleDraftChange,
    handleAvatarFile,
    handleBannerFile,
    handleRemoveBanner,
    handleLongDescImageUpload,
    handleSave,
  } = inlineEdit


  // -------------------------------------------------------------------
  // Tabs: which exist for this viewer, which is shown.
  // -------------------------------------------------------------------
  // About is organization-only. It shows when there is a long description,
  // or when the viewer is this organization (to write one), or mid-edit.
  const aboutEditingForOrg = isEditing && canEditInline && viewIsOrg
  const isViewerThisEntity = isOwnProfile || isActingAsThisGroup
  const aboutAvailable =
    viewIsOrg &&
    (!!displayLongDescription || isViewerThisEntity || aboutEditingForOrg)
  // Groups only while the viewer's *active* identity is this profile: the
  // personal user on their own profile with no group active, or a group on
  // its own profile while acting as it. (Acting as a group on your personal
  // profile, the CGS endpoint would return the group's memberships.)
  const isActiveIdentityThisProfile =
    (isOwnProfile && !activeOrg) || isActingAsThisGroup
  const editing = isEditing && canEditInline
  // While editing, only the editable sections stay switchable: Overview,
  // plus About for organizations.
  const isTabEditable = (key: TabKey) =>
    key === "overview" || (viewIsOrg && key === "about")

  const visibleTabs = useMemo<ProfileTabItem[]>(
    () =>
      TABS.filter((t) => {
        if (t.key === "groups") return isActiveIdentityThisProfile
        if (t.key === "about") return aboutAvailable
        return true
      }).map((t) => ({
        key: t.key,
        label: t.label,
        disabled:
          editing && !(t.key === "overview" || (viewIsOrg && t.key === "about")),
      })),
    [isActiveIdentityThisProfile, aboutAvailable, editing, viewIsOrg],
  )

  const settingsHref =
    isAdminOfThisGroup && did
      ? `/groups/${encodeURIComponent(did)}/settings`
      : undefined

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawTab = searchParams?.get("tab") ?? null
  const tabFromUrl = useMemo<TabKey>(() => {
    // Migration shim: the legacy ?tab=certs slug resolves to activities so
    // old links and bookmarks keep working.
    const v = rawTab === "certs" ? "activities" : rawTab
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : "overview"
  }, [rawTab])

  // The old ?tab=settings panel moved to the Settings page (or the group's
  // settings). Send its links there; anyone else lands on the Overview.
  useEffect(() => {
    if (rawTab !== "settings" || isAuthLoading || !did) return
    if (isOwnProfile && !activeOrg) router.replace("/settings")
    else if (isActingAsThisGroup)
      router.replace(`/groups/${encodeURIComponent(did)}/settings`)
  }, [rawTab, isAuthLoading, did, isOwnProfile, activeOrg, isActingAsThisGroup, router])

  // Canonicalize the address bar to the handle form. When the profile was
  // opened by its durable DID (e.g. a shared link), swap to `/{handle}` once
  // the handle resolves — preserving any ?tab= query. The DID can't rot, so
  // the link stays correct; the handle is just the pretty display form. A
  // STALE handle (the account migrated away from it, recovered to its DID
  // via the indexer — #184) likewise self-heals to the current handle.
  // `resolvedHandle === did` means no real handle resolved, so the URL is
  // left untouched rather than rewritten to a DID.
  useEffect(() => {
    if (!handleOrDid || !resolvedHandle || resolvedHandle === did) return
    const addressedByDid = handleOrDid.startsWith("did:")
    const staleHandle =
      !addressedByDid &&
      resolvedHandle.toLowerCase() !== handleOrDid.toLowerCase()
    if ((addressedByDid && resolvedHandle !== handleOrDid) || staleHandle) {
      const qs = searchParams?.toString()
      router.replace(profileUrl(resolvedHandle) + (qs ? `?${qs}` : ""))
    }
  }, [handleOrDid, resolvedHandle, did, searchParams, router])

  // A deep link can name a tab this viewer doesn't get (e.g. ?tab=groups
  // on someone else's profile, or ?tab=about on a person). Show the
  // Overview instead of a blank panel. Wait for the session so an owner's
  // own link isn't bounced.
  const shownTab: TabKey =
    !isAuthLoading && !visibleTabs.some((t) => t.key === tabFromUrl)
      ? "overview"
      : editing && !isTabEditable(tabFromUrl)
        ? "overview"
        : tabFromUrl

  // `?edit=1` opens the editor: the one way into profile editing, used by
  // "Edit profile" on Home and in Settings (and /settings/edit-profile,
  // which redirects here). It waits until the edit base is the raw record
  // (so a save keeps the avatar and banner blobs), the org marker and its
  // location have loaded (so the drafts are seeded in full), and the
  // viewer's identity is known; then it opens the editor once and drops
  // the param so a reload or Back doesn't reopen it. Anyone who can't edit
  // this profile just sees it, without the param.
  const wantsEdit = searchParams?.get("edit") === "1"
  const editSeedReady =
    editBaseValid &&
    !isOrgMarkerLoading &&
    (!inlineLocation.refUri ||
      resolvedLocationRef?.uri === inlineLocation.refUri)
  useEffect(() => {
    if (!wantsEdit || !pathname || isAuthLoading || isOrgsLoading || !did) return
    if (canEditInline && !editSeedReady) return
    if (canEditInline && !isEditing) handleEditClick()
    const qs = new URLSearchParams(searchParams?.toString() ?? "")
    qs.delete("edit")
    const query = qs.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [
    wantsEdit,
    pathname,
    isAuthLoading,
    isOrgsLoading,
    did,
    canEditInline,
    editSeedReady,
    isEditing,
    handleEditClick,
    searchParams,
    router,
  ])

  // `replace`, not `push`: switching sections doesn't stack history
  // entries, so Back leaves the profile instead of stepping through tabs.
  const selectTab = useCallback(
    (next: string) => {
      const tab = visibleTabs.find((t) => t.key === next)
      if (!tab || tab.disabled || !pathname) return
      const qs = new URLSearchParams(searchParams?.toString() ?? "")
      for (const p of PANEL_PARAMS) qs.delete(p)
      if (next !== "overview") qs.set("tab", next)
      const query = qs.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [visibleTabs, pathname, searchParams, router],
  )

  if (isProfileLoading) {
    return (
      <PageContainer width="default" className="profile-page">
        <ProfileHeaderSkeleton />
      </PageContainer>
    )
  }

  if (profileError || !did) {
    return (
      <PageContainer width="default" className="profile-page">
        <NotFoundMarker />
        <EmptyState
          icon={UserX}
          title="Profile not found"
          description={`We couldn't find a Certified profile for ${handleOrDid ? `@${handleOrDid}` : "this user"}.`}
          className="pt-16"
        />
      </PageContainer>
    )
  }

  const basePath = pathname || ""
  const displayName =
    effectiveProfile?.displayName || resolvedHandle || "this account"

  return (
    <PageContainer width="default" className="profile-page">
      {editing ? (
        <div className="profile-page__edit-bar">
          <EditBanner
            label="Editing profile"
            error={saveError}
            isSaving={isSaving}
            onCancel={handleCancelEdit}
            onSave={handleSave}
            className="!m-0"
          />
        </div>
      ) : canEditInline ? (
        <ProfileOwnerBar
          isGroup={isActingAsThisGroup}
          groupSettingsHref={isActingAsThisGroup ? settingsHref : undefined}
        />
      ) : null}

      {/* Re-entry banner: only on the viewer's own personal profile while
          the onboarding gate holds (a Bluesky profile, no Certified one
          yet). Gates itself. */}
      {isOwnProfile && !activeOrg ? <OnboardingBanner /> : null}

      <ProfileHeader
        did={did}
        handle={resolvedHandle || (rawHandle ?? null)}
        profile={effectiveProfile}
        avatarUrl={effectiveAvatarUrl}
        bannerUrl={effectiveBannerUrl}
        basePath={basePath}
        isOrg={viewIsOrg}
        hasCertifiedProfile={hasCertifiedProfile}
        hasBlueskyProfile={hasBlueskyProfile}
        orgTypeTags={displayOrgTypeTags}
        orgLocationName={displayLocation.name}
        orgFoundedDate={displayFoundedDate}
        additionalUrls={effectiveAdditionalUrls}
        canEdit={canEditInline}
        settingsHref={canEditInline ? undefined : settingsHref}
        onEditClick={handleEditClick}
        isEditing={editing}
        drafts={drafts}
        onDraftChange={handleDraftChange}
        onAvatarFile={handleAvatarFile}
        hasPendingAvatar={hasPendingAvatar}
        onBannerFile={handleBannerFile}
        onBannerRemove={handleRemoveBanner}
        hasPendingBanner={hasPendingBanner}
      />

      <Tabs value={shownTab} onChange={selectTab}>
        <ProfileTabs tabs={visibleTabs} active={shownTab} sticky={!editing} />

        <div className="profile-page__panel">
          <TabPanelTransition activeKey={shownTab} order={TAB_ORDER}>
            <TabPanel value={shownTab}>
              {shownTab === "overview" ? (
                <ProfileOverview
                  did={did}
                  subjectName={displayName}
                  basePath={basePath}
                  viewerIsOwner={isViewerThisEntity}
                  isEditing={editing}
                  drafts={drafts}
                  onDraftChange={handleDraftChange}
                  isOrg={viewIsOrg}
                  orgLongDescription={displayLongDescription}
                  orgTypeTags={displayOrgTypeTags}
                  orgLocationName={displayLocation.name}
                  orgLocationCoords={displayLocation.coords}
                />
              ) : null}
              {shownTab === "about" ? (
                <div className="profile-page__about">
                  {editing && viewIsOrg ? (
                    <LeafletEditor
                      value={drafts.longDescription ?? null}
                      onChange={(next: LinearDocument) =>
                        handleDraftChange("longDescription", next)
                      }
                      placeholder="A longer description of this organization."
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
                    // Empty About, but the viewer is this organization:
                    // offer to write it. Other viewers never reach this
                    // branch (the tab is hidden when there's no content).
                    <EmptyState
                      icon={AlignLeft}
                      title="No About yet"
                      description="Tell people what this organization does, in your own words."
                      headingLevel={2}
                    >
                      {canEditInline ? (
                        <Button variant="secondary" size="sm" onClick={handleEditClick}>
                          <Pencil size={16} strokeWidth={1.75} aria-hidden />
                          Write About
                        </Button>
                      ) : null}
                    </EmptyState>
                  ) : null}
                </div>
              ) : null}
              {shownTab === "activities" ? (
                <ProfileCerts
                  did={did}
                  viewerIsOwner={isViewerThisEntity}
                  aggregateOwned={isOwnProfile && !activeOrg}
                />
              ) : null}
              {shownTab === "projects" ? (
                <ProfileProjects
                  did={did}
                  viewerIsOwner={isViewerThisEntity}
                  aggregateOwned={isOwnProfile && !activeOrg}
                />
              ) : null}
              {shownTab === "groups" && isActiveIdentityThisProfile ? (
                <ProfileGroups did={did} />
              ) : null}
              {shownTab === "endorsements" ? (
                <ProfileEndorsements did={did} />
              ) : null}
              {shownTab === "followers" ? <ProfileFollowers did={did} /> : null}
              {shownTab === "lists" ? (
                <ProfileLists did={did} viewerIsOwner={isViewerThisEntity} />
              ) : null}
            </TabPanel>
          </TabPanelTransition>
        </div>
      </Tabs>
    </PageContainer>
  )
}
