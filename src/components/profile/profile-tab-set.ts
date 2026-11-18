import type { ProfileTabItem } from "@/components/profile/profile-tabs"
import {
  isKnownEmpty,
  type ProfileSummary,
  type SectionCount,
} from "@/components/profile/use-profile-summary"

export type ProfileTabKey =
  | "overview"
  | "about"
  | "activities"
  | "projects"
  | "groups"
  | "endorsements"
  | "followers"
  | "lists"

/**
 * Tab strip order. About (organizations only, while editing) sits next to
 * Overview; Groups shows only when the account itself is linked to it.
 * Other pages link to these keys as `?tab=…`, so keep them stable. The
 * old `?tab=settings` panel is gone: that link now goes to Settings.
 */
export const PROFILE_TABS: readonly { key: ProfileTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "about", label: "About" },
  { key: "activities", label: "Activities" },
  { key: "projects", label: "Projects" },
  { key: "groups", label: "Groups" },
  { key: "endorsements", label: "Endorsements" },
  { key: "followers", label: "Followers" },
  { key: "lists", label: "Lists" },
]

/**
 * The tabs a profile shows, with their counts.
 *
 * The account itself sees the tabs a visitor sees (its owner bar says
 * "This is how others see your profile"): no About, no Groups, and no
 * section known to be empty (never hidden while loading or failed); its
 * empty sections keep their actions on the Overview. A link that names
 * one of those tabs (Home's "Lists", an old `?tab=groups`) still opens it
 * for the account, with the tab in the strip while it is open. About is
 * an organization's: a visitor reads the description in the header's
 * lead, and the organization writes it while editing, when the tab
 * appears. While editing only Overview and About stay switchable.
 */
export function visibleProfileTabs({
  counts,
  tabFromUrl,
  isViewerThisEntity,
  isActiveIdentityThisProfile,
  isOrg,
  editing,
}: {
  counts: ProfileSummary["counts"]
  /** The tab the address asks for. */
  tabFromUrl: ProfileTabKey
  /** The viewer's current identity is this account. */
  isViewerThisEntity: boolean
  /** The viewer's *active* identity is this profile (its Groups list
   *  reads the active identity's memberships). */
  isActiveIdentityThisProfile: boolean
  isOrg: boolean
  /** The account is editing its profile. */
  editing: boolean
}): ProfileTabItem[] {
  const sectionCount: Partial<Record<ProfileTabKey, SectionCount>> = {
    activities: counts.activities,
    projects: counts.projects,
    endorsements: counts.endorsements,
    followers: counts.followers,
    lists: counts.lists,
  }
  // Endorsements holds what the account received and what it gave, and
  // Followers its followers and its follows: a tab is empty only when
  // both of its lists are known to be (a failed list isn't).
  const knownEmpty = (key: ProfileTabKey): boolean => {
    if (key === "endorsements")
      return isKnownEmpty(counts.endorsements) && isKnownEmpty(counts.endorsementsGiven)
    if (key === "followers")
      return isKnownEmpty(counts.followers) && isKnownEmpty(counts.following)
    const c = sectionCount[key]
    return c ? isKnownEmpty(c) : false
  }
  // The tab the account itself was linked to, kept in its strip.
  const ownerLinkedTo = (key: ProfileTabKey): boolean =>
    isViewerThisEntity && key === tabFromUrl
  return PROFILE_TABS.filter((t) => {
    if (t.key === "groups") return isActiveIdentityThisProfile && ownerLinkedTo("groups")
    if (t.key === "about") return isOrg && (editing || ownerLinkedTo("about"))
    return !knownEmpty(t.key) || ownerLinkedTo(t.key)
  }).map((t) => {
    const c = sectionCount[t.key]
    return {
      key: t.key,
      label: t.label,
      count: c ? tabCountLabel(c) : undefined,
      disabled: editing && !(t.key === "overview" || (isOrg && t.key === "about")),
    }
  })
}

/** A tab's count label: nothing while unknown or failed, nor for zero (a
 *  Followers tab open for the accounts it follows isn't "Followers 0"),
 *  "40+" when more exist than were counted. */
function tabCountLabel(c: SectionCount): string | undefined {
  if (c.isLoading || c.failed || c.value === null || c.value === 0) return undefined
  return `${c.value.toLocaleString()}${c.more && c.value > 0 ? "+" : ""}`
}
