"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useParams, useSearchParams } from "next/navigation"
import { useProfileNavbar, usePageTitle } from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useOrg } from "@/lib/groups/org-context"
import ProfileHeader from "@/components/profile/profile-header"
import ProfileOverview from "@/components/profile/profile-overview"
import ProfileEndorsements from "@/components/profile/profile-endorsements"
import ProfileGroups from "@/components/profile/profile-groups"
import UserFeed from "@/components/feed/user-feed"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import { UserX } from "lucide-react"

type TabKey =
  | "overview"
  | "activities"
  | "groups"
  | "endorsements"

// "Overview" leads the strip and is the default tab for the positioning
// redesign: it shows the identity face card (banner/avatar/name/bio +
// digest of groups & endorsements). The other tabs unchanged.
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activities", label: "Activities" },
  { key: "endorsements", label: "Endorsements" },
  { key: "groups", label: "Groups" },
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

  // Surface the person's display name in the desktop top bar's title slot.
  // On mobile this is suppressed by useProfileNavbar() (profile-overlay
  // mode wins over titled mode in the mobile navbar), so the two coexist.
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

  const router = useRouter()
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

  const changeTab = useCallback(
    (next: TabKey) => {
      setActiveTab(next)
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next === "overview") {
        params.delete("tab")
      } else {
        params.set("tab", next)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

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
      {/* Mobile-only identity block above the in-page tabs. Hidden on
          desktop where the Overview tab carries the identity instead. */}
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

      {/* Mobile in-page tab strip. Hidden on desktop where the top bar's
          row 2 hosts the same tabs. */}
      <div
        className="profile-tabs profile-tabs--in-page"
        role="tablist"
        aria-label="Profile sections"
        onKeyDown={(e) => {
          const idx = TABS.findIndex((t) => t.key === activeTab)
          if (idx < 0) return
          let next = idx
          if (e.key === "ArrowRight") next = (idx + 1) % TABS.length
          else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length
          else if (e.key === "Home") next = 0
          else if (e.key === "End") next = TABS.length - 1
          else return
          e.preventDefault()
          const nextKey = TABS[next].key
          changeTab(nextKey)
          const el = document.getElementById(`tab-${nextKey}`) as HTMLButtonElement | null
          el?.focus()
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            aria-selected={activeTab === tab.key}
            aria-controls={activeTab === tab.key ? `tabpanel-${tab.key}` : undefined}
            className={`profile-tabs__tab ${
              activeTab === tab.key ? "profile-tabs__tab--active" : ""
            }`}
            onClick={() => changeTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="profile-panel">
        {activeTab === "overview" && (
          <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
            <ProfileOverview
              profile={profile}
              avatarUrl={avatarUrl}
              bannerUrl={bannerUrl}
              handle={resolvedHandle || (rawHandle ?? null)}
              did={did}
              activityCountLabel={activityCountLabel}
              basePath={pathname || ""}
              editHref={editHref}
              settingsHref={settingsHref}
              isOwnProfile={isOwnProfile}
            />
          </div>
        )}
        {activeTab === "activities" && (
          <div
            role="tabpanel"
            id="tabpanel-activities"
            aria-labelledby="tab-activities"
            className="profile-panel--reading"
          >
            <UserFeed authorDid={did} />
          </div>
        )}
        {activeTab === "groups" && (
          <div
            role="tabpanel"
            id="tabpanel-groups"
            aria-labelledby="tab-groups"
            className="profile-panel--reading"
          >
            <ProfileGroups did={did} showRoles={isOwnProfile} />
          </div>
        )}
        {activeTab === "endorsements" && (
          <div
            role="tabpanel"
            id="tabpanel-endorsements"
            aria-labelledby="tab-endorsements"
            className="profile-panel--reading"
          >
            <ProfileEndorsements did={did} />
          </div>
        )}
      </div>
    </div>
  )
}
