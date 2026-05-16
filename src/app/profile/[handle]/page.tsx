"use client"

import { useMemo, useState } from "react"
import { usePathname, useParams, useSearchParams } from "next/navigation"
import { useProfileNavbar, usePageTitle } from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useOrg } from "@/lib/groups/org-context"
import ProfileHeader from "@/components/profile/profile-header"
import ProfileSidebar from "@/components/profile/profile-sidebar"
import ProfileOverview from "@/components/profile/profile-overview"
import ProfileEndorsements from "@/components/profile/profile-endorsements"
import ProfileProjects from "@/components/profile/profile-projects"
import UserFeed from "@/components/feed/user-feed"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import { UserX } from "lucide-react"

type TabKey =
  | "overview"
  | "certs"
  | "projects"
  | "endorsements"

// Tab strip post-rename: Activities became "Certs", Groups dropped from
// the strip (still surfaced in the sidebar), Projects added between
// Certs and Endorsements. Keep the order in sync with PROFILE_TABS in
// desktop-top-bar.tsx — that's the single source the user actually
// clicks on desktop.
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "certs", label: "Certs" },
  { key: "projects", label: "Projects" },
  { key: "endorsements", label: "Endorsements" },
]

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

  const titleForTopBar =
    profile?.displayName || (resolvedHandle ? `@${resolvedHandle}` : "Profile")
  usePageTitle(titleForTopBar)

  const { groups } = useOrg()
  const memberOrg = did ? groups.find((g) => g.groupDid === did) : undefined
  const isAdminOfThisGroup =
    !!memberOrg && (memberOrg.role === "owner" || memberOrg.role === "admin")

  const editHref = isOwnProfile
    ? "/settings/edit-profile"
    : isAdminOfThisGroup && did
      ? `/groups/${encodeURIComponent(did)}/edit-profile`
      : undefined

  const settingsHref =
    isAdminOfThisGroup && did
      ? `/groups/${encodeURIComponent(did)}/settings`
      : undefined

  const eyebrow = isOwnProfile ? "Your profile" : undefined

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

  return (
    <div className="profile-page">
      {/* Mobile-only identity block. Hidden on desktop where the sidebar
          carries the identity. The desktop top bar's row 2 is the only
          tab strip; there is no in-page tab strip. */}
      <div className="profile-page__mobile-header">
        <ProfileHeader
          profile={profile}
          avatarUrl={avatarUrl}
          bannerUrl={bannerUrl}
          handle={resolvedHandle || (rawHandle ?? null)}
          did={did}
          activityCountLabel={activityCountLabel}
          editHref={editHref}
          settingsHref={settingsHref}
          eyebrow={eyebrow}
        />
      </div>

      <div className="profile-page__layout">
        <ProfileSidebar
          profile={profile}
          avatarUrl={avatarUrl}
          handle={resolvedHandle || (rawHandle ?? null)}
          did={did}
          basePath={pathname || ""}
          editHref={editHref}
          settingsHref={settingsHref}
        />

        <div className="profile-page__main">
          {activeTab === "overview" && (
            <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
              <ProfileOverview
                bannerUrl={bannerUrl}
                did={did}
                activityCountLabel={activityCountLabel}
                basePath={pathname || ""}
              />
            </div>
          )}
          {activeTab === "certs" && (
            <div
              role="tabpanel"
              id="tabpanel-certs"
              aria-labelledby="tab-certs"
            >
              <UserFeed authorDid={did} />
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
