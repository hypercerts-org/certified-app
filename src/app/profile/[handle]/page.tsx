"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useParams, useSearchParams } from "next/navigation"
import { useProfileNavbar } from "@/lib/navbar-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useOrg } from "@/lib/groups/org-context"
import ProfileHeader from "@/components/profile/profile-header"
import ProfileEndorsements from "@/components/profile/profile-endorsements"
import ProfileGroups from "@/components/profile/profile-groups"
import UserFeed from "@/components/feed/user-feed"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import { UserX } from "lucide-react"

type TabKey =
  | "activities"
  | "groups"
  | "endorsements"

// Comments + Evaluations were earlier placeholder tabs with "coming
// soon" empty states. Hidden until they have real content — leaving
// dead tabs in the tablist dilutes information scent and adds noise
// to keyboard nav.
const TABS: { key: TabKey; label: string }[] = [
  { key: "activities", label: "Activities" },
  { key: "groups", label: "Groups" },
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

  // If the viewed profile is one of the viewer's groups, surface
  // admin affordances (Edit Profile + Settings cog) on the hero.
  // /groups/[groupDid] used to host these on a separate page; we
  // consolidated to a single profile surface.
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

  // We fetch activities here only so we can derive the count label shown
  // in the header. The UserFeed inside the Activities tab re-fetches them;
  // both calls use the same cached URL path so browser HTTP caching makes
  // this cheap. Optimization (shared cache) can come later.
  const { activities, hasMore } = useUserActivities(did)
  const activityCountLabel = hasMore
    ? `${activities.length}+`
    : `${activities.length}`

  // Persist the active tab in the URL (`?tab=endorsements`) so refresh
  // or share lands on the same view. Falls back to "activities" if the
  // param is missing or unrecognised.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabFromUrl = useMemo<TabKey>(() => {
    const v = searchParams?.get("tab")
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : "activities"
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)

  // Keep state in sync when the user navigates with Back/Forward (the
  // URL changes; mirror it into state). Comparing first prevents the
  // setter from looping on every searchParams reference.
  if (tabFromUrl !== activeTab && TABS.some((t) => t.key === tabFromUrl)) {
    setActiveTab(tabFromUrl)
  }

  const changeTab = useCallback(
    (next: TabKey) => {
      setActiveTab(next)
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next === "activities") {
        // Default tab — keep the URL clean instead of carrying ?tab=activities.
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

      <div
        className="profile-tabs"
        role="tablist"
        aria-label="Profile sections"
        onKeyDown={(e) => {
          // WAI-ARIA Tabs Pattern: Left/Right move between tabs, Home/End
          // jump to first/last. Wraps at the boundaries.
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
            // Only the active tab gets aria-controls because only the
            // active tabpanel is mounted. Dangling refs from inactive
            // tabs would point at non-existent ids and confuse screen
            // readers that follow the relationship.
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
        {activeTab === "activities" && (
          <div role="tabpanel" id="tabpanel-activities" aria-labelledby="tab-activities">
            <UserFeed authorDid={did} />
          </div>
        )}
        {activeTab === "groups" && (
          <div role="tabpanel" id="tabpanel-groups" aria-labelledby="tab-groups">
            <ProfileGroups did={did} showRoles={isOwnProfile} />
          </div>
        )}
        {activeTab === "endorsements" && (
          <div role="tabpanel" id="tabpanel-endorsements" aria-labelledby="tab-endorsements">
            <ProfileEndorsements did={did} />
          </div>
        )}
      </div>
    </div>
  )
}
