"use client"

import { useFollowedDids } from "@/hooks/use-followed-dids"
import { useGlobalFeed } from "@/hooks/use-global-feed"
import { useTrustedEndorsedDids } from "@/hooks/use-trusted-endorsed-dids"
import { useAuth } from "@/lib/auth/auth-context"
import EmptyState from "@/components/ui/empty-state"
import { Filter, Users, LogIn, Inbox } from "lucide-react"
import FeedLayout from "./feed-layout"

interface ActivityFeedProps {
  mode: "for-you" | "following"
  showEverything: boolean
  activeEvaluatorList: string[]
  evaluatorStableKey: string
}

export default function ActivityFeed({
  mode,
  showEverything,
  activeEvaluatorList,
  evaluatorStableKey,
}: ActivityFeedProps) {
  if (mode === "for-you") {
    return (
      <GlobalFeed
        showEverything={showEverything}
        activeEvaluatorList={activeEvaluatorList}
        evaluatorStableKey={evaluatorStableKey}
      />
    )
  }
  return <FollowingFeed />
}

function GlobalFeed({
  showEverything,
  activeEvaluatorList,
  evaluatorStableKey,
}: {
  showEverything: boolean
  activeEvaluatorList: string[]
  evaluatorStableKey: string
}) {
  const { endorsedDids, isLoading: endorsementsLoading, error: endorsementError } =
    useTrustedEndorsedDids(activeEvaluatorList, evaluatorStableKey)

  // When showEverything is true, pass undefined (no filter).
  // When showEverything is false, use endorsedDids unless there was an error.
  const effectiveEndorsedDids = showEverything
    ? undefined
    : (!endorsementError ? endorsedDids : undefined)

  const {
    activities,
    dids,
    labels,
    selectedLabels,
    setSelectedLabels,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = useGlobalFeed({
    endorsedDids: effectiveEndorsedDids,
  })

  // Expose filter controls to parent via useEffect (not during render)
  // Determine empty state when not showing everything
  const emptyState = !showEverything ? getTrustedEmptyState({
    activeCount: activeEvaluatorList.length,
    activitiesCount: activities.length,
    isLoading: isLoading || endorsementsLoading,
  }) : undefined

  // When endorsement fetch fails and not showing everything, degrade gracefully
  const showEndorsementWarning = !showEverything && endorsementError != null

  return (
    <>
      {showEndorsementWarning && (
        <div className="feed__warning" role="alert">
          Could not load endorsements. Showing all activities.
        </div>
      )}
      <FeedLayout
        activities={activities}
        getDid={(uri) => dids.get(uri) ?? ""}
        labels={labels}
        isLoading={isLoading || (!showEverything && endorsementsLoading)}
        isLoadingMore={isLoadingMore}
        error={error}
        hasMore={hasMore}
        loadMore={loadMore}
        emptyState={showEndorsementWarning ? undefined : emptyState}
      />
    </>
  )
}

function getTrustedEmptyState({
  activeCount,
  activitiesCount,
  isLoading,
}: {
  activeCount: number
  activitiesCount: number
  isLoading: boolean
}): React.ReactNode | undefined {
  if (isLoading) return undefined

  if (activeCount === 0) {
    return (
      <EmptyState
        icon={Filter}
        title="No evaluators selected"
        description="Select at least one evaluator to see endorsed activity."
      />
    )
  }

  if (activitiesCount === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No endorsed activities yet"
        description="No activities from people endorsed by your selected evaluators yet."
      />
    )
  }

  return undefined
}

function FollowingFeed() {
  const { did } = useAuth()
  const { followedDids, isLoading: followsLoading, error: followsError } = useFollowedDids(did)

  const {
    activities,
    dids,
    labels,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = useGlobalFeed({
    endorsedDids: followedDids,
  })

  const emptyState = getFollowingEmptyState({
    did,
    followedCount: followedDids.size,
    activitiesCount: activities.length,
    isLoading: isLoading || followsLoading,
  })

  return (
    <>
      {followsError && (
        <div className="feed__warning" role="alert">
          Could not load your follow list. Please try again later.
        </div>
      )}
      <FeedLayout
        activities={activities}
        getDid={(uri) => dids.get(uri) ?? ""}
        labels={labels}
        isLoading={isLoading || followsLoading}
        isLoadingMore={isLoadingMore}
        error={error}
        hasMore={hasMore}
        loadMore={loadMore}
        emptyState={followsError ? undefined : emptyState}
      />
    </>
  )
}

function getFollowingEmptyState({
  did,
  followedCount,
  activitiesCount,
  isLoading,
}: {
  did: string | null
  followedCount: number
  activitiesCount: number
  isLoading: boolean
}): React.ReactNode | undefined {
  if (isLoading) return undefined

  if (!did) {
    return (
      <EmptyState
        icon={LogIn}
        title="Sign in to see your feed"
        description="Sign in to see activities from people you follow."
      />
    )
  }

  if (followedCount === 0) {
    return (
      <EmptyState
        icon={Users}
        title="You're not following anyone yet"
        description="Follow people to see their activities here."
      />
    )
  }

  if (activitiesCount === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No activities yet"
        description="People you follow haven't posted any activities yet."
      />
    )
  }

  return undefined
}
