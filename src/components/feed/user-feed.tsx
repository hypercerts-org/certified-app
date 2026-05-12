"use client"

import { useUserActivities } from "@/hooks/use-user-activities"
import FeedLayout from "./feed-layout"

interface UserFeedProps {
  /** DID of the user whose activities to show. */
  authorDid: string | null
}

/**
 * Activity feed bound to a specific user's DID. Shares the FeedLayout
 * renderer with GlobalFeed and PersonalFeed so the rendering path is
 * identical across every feed surface.
 */
export default function UserFeed({ authorDid }: UserFeedProps) {
  const { activities, isLoading, isLoadingMore, error, hasMore, loadMore } =
    useUserActivities(authorDid)

  return (
    <FeedLayout
      activities={activities}
      getDid={() => authorDid ?? ""}
      isLoading={isLoading}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      loadMore={loadMore}
    />
  )
}
