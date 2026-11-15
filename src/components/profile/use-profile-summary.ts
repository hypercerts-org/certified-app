"use client"

import { useMemo } from "react"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useUserActivityCount } from "@/hooks/use-user-activity-count"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useFollowers } from "@/hooks/use-followers"
import { useFollowing } from "@/hooks/use-following"
import { useTypedLists } from "@/hooks/use-typed-lists"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/**
 * One count for a profile section: the number, whether it is still
 * loading, and whether it failed. `value` is null while unknown.
 */
export interface SectionCount {
  value: number | null
  /** More exist than were counted ("40+"). */
  more?: boolean
  isLoading: boolean
  failed: boolean
}

/**
 * Everything the profile page reads about an account's content, loaded
 * once at the page so the tab strip (counts, which tabs to show) and the
 * Overview share one fetch per source.
 */
export function useProfileSummary(did: string | null) {
  const activities = useUserIndexerActivities(did)
  const activityCount = useUserActivityCount(did)
  const projects = useUserProjects(did)
  const received = useReceivedEndorsements(did)
  const given = useGivenEndorsements(did)
  const followers = useFollowers(did)
  const following = useFollowing(did)
  const lists = useTypedLists(did)

  // The newest activities first, the account's own and the ones it
  // contributed to (an activity can be in both lists).
  const recentActivities = useMemo(() => {
    const seen = new Set<string>()
    const merged: ActivityRecord[] = []
    for (const r of [...activities.created, ...activities.contributed]) {
      if (seen.has(r.uri)) continue
      seen.add(r.uri)
      merged.push(r)
    }
    merged.sort((a, b) =>
      (a.value.createdAt ?? "") < (b.value.createdAt ?? "") ? 1 : -1,
    )
    return merged
  }, [activities.created, activities.contributed])

  const counts = useMemo(() => {
    const activitiesLoading = activities.isLoading && recentActivities.length === 0
    // The account's own activities (the indexer's exact total); when it
    // created none, the ones it contributed to, so the tab still says
    // what it holds.
    const ownCount = activityCount ?? activities.created.length
    const activityValue = activitiesLoading
      ? null
      : ownCount > 0
        ? ownCount
        : activities.contributed.length
    const activityMore =
      activityCount === null && activities.hasMore && activityValue !== null && activityValue > 0

    const endorsementsLoading =
      (received.isLoading && received.endorsements.length === 0) ||
      (given.isLoading && given.endorsements.length === 0)

    const result: Record<
      "activities" | "projects" | "endorsements" | "followers" | "lists",
      SectionCount
    > & { endorsementsGiven: number; following: number } = {
      activities: {
        value: activityValue,
        more: activityMore,
        isLoading: activitiesLoading,
        failed: !!activities.error,
      },
      projects: {
        value: projects.isLoading && projects.projects.length === 0 ? null : projects.projects.length,
        more: projects.truncated,
        isLoading: projects.isLoading && projects.projects.length === 0,
        failed: !!projects.error,
      },
      endorsements: {
        value: received.isLoading && received.endorsements.length === 0 ? null : received.endorsements.length,
        isLoading: endorsementsLoading,
        failed: !!received.error,
      },
      followers: {
        value: followers.count,
        isLoading: followers.count === null,
        failed: !!followers.error,
      },
      lists: {
        value: lists.isLoading ? null : lists.lists.length,
        isLoading: lists.isLoading,
        failed: !!lists.error,
      },
      endorsementsGiven: given.endorsements.length,
      following: following.count,
    }
    return result
  }, [
    activities.isLoading,
    activities.created.length,
    activities.contributed.length,
    activities.hasMore,
    activities.error,
    activityCount,
    recentActivities.length,
    projects.isLoading,
    projects.projects.length,
    projects.truncated,
    projects.error,
    received.isLoading,
    received.endorsements.length,
    received.error,
    given.isLoading,
    given.endorsements.length,
    followers.count,
    followers.error,
    following.count,
    lists.isLoading,
    lists.lists.length,
    lists.error,
  ])

  return {
    activities,
    recentActivities,
    projects,
    received,
    given,
    followers,
    following,
    counts,
  }
}

export type ProfileSummary = ReturnType<typeof useProfileSummary>

/**
 * Whether a section is empty for sure: loaded, not failed, and zero. A
 * section still loading, or one that failed, isn't known to be empty.
 */
export function isKnownEmpty(count: SectionCount): boolean {
  return !count.isLoading && !count.failed && count.value === 0
}
