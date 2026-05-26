"use client"

import { useEffect, useRef } from "react"
import { AlertCircle, Inbox, LogIn, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import EmptyState from "@/components/ui/empty-state"
import ActivityCardSkeleton from "@/components/feed/activity-card-skeleton"
import FeedEventCard from "@/components/feed/feed-event-card"
import type { UseFollowerEventsFeedResult } from "@/hooks/use-follower-events-feed"

/**
 * Home-timeline feed shell. Three distinct empty-state variants per
 * issue #88's plan-v2:
 *   - signed-out: "Sign in to see your feed."
 *   - signed-in + 0 follows: "Follow people to see their activity here."
 *   - signed-in + follows but 0 events: "No activity yet."
 *
 * The variants are mutually exclusive — the branch logic checks
 * `authorsCount` from the hook (signed-in + follows = authorsCount > 0
 * after the cap-aware dedupe).
 */
export default function HomeFeed(props: UseFollowerEventsFeedResult) {
  const {
    events,
    authorsCount,
    isLoading,
    isLoadingMore,
    error,
    errorCode,
    hasMore,
    isOversized,
    truncatedBySource,
    loadMore,
  } = props

  const { did, isAuthenticated, isLoading: authLoading } = useAuth()
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // IntersectionObserver-based infinite scroll. Mirrors the pattern in
  // feed-layout.tsx.
  useEffect(() => {
    if (!hasMore || isLoadingMore || isLoading) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadMore()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, isLoading, loadMore])

  // Auth resolving — defer the empty-state choice until we know
  // whether the user is signed in.
  if (authLoading) {
    return (
      <div className="feed">
        <SkeletonRows />
      </div>
    )
  }

  // Signed out.
  if (!isAuthenticated || !did) {
    return (
      <div className="feed">
        <EmptyState
          icon={LogIn}
          title="Sign in to see your feed"
          description="Sign in to see activity from people you follow."
        />
      </div>
    )
  }

  const warningBanner =
    isOversized || truncatedBySource ? (
      <div className="feed__warning" role="status">
        {isOversized
          ? "You follow more than 500 people. Showing activity from a subset."
          : "Your follow list is too large to fully sync. Some activity may be missing."}
      </div>
    ) : null

  // Error with no events on screen — primary state.
  if (error && events.length === 0) {
    return (
      <div className="feed">
        {warningBanner}
        <EmptyState
          icon={AlertCircle}
          title={
            errorCode === "AUTHORS_FILTER_TOO_LARGE"
              ? "Follow list too large"
              : "Couldn't load your feed"
          }
          description={error}
        />
      </div>
    )
  }

  // Loading the first page — show skeletons.
  if (isLoading && events.length === 0) {
    return (
      <div className="feed">
        {warningBanner}
        <SkeletonRows />
      </div>
    )
  }

  // Empty — three variants. authorsCount === 0 covers the "no follows
  // yet" case explicitly; otherwise it's "follows haven't been active."
  if (events.length === 0) {
    if (authorsCount === 0) {
      return (
        <div className="feed">
          {warningBanner}
          <EmptyState
            icon={Users}
            title="You're not following anyone yet"
            description="Follow people to see their activity in your feed."
          />
        </div>
      )
    }
    return (
      <div className="feed">
        {warningBanner}
        <EmptyState
          icon={Inbox}
          title="No activity yet"
          description="When people you follow create certs or endorse others, you'll see it here."
        />
      </div>
    )
  }

  return (
    <div className="feed">
      {warningBanner}
      {events.map((hydrated) => (
        <FeedEventCard
          key={hydrated.event.id}
          event={hydrated.event}
          payload={hydrated.payload}
        />
      ))}
      {isLoadingMore ? <ActivityCardSkeleton /> : null}
      {hasMore ? (
        <div ref={sentinelRef} className="feed__sentinel" aria-hidden="true" />
      ) : null}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      <ActivityCardSkeleton />
      <ActivityCardSkeleton />
      <ActivityCardSkeleton />
    </>
  )
}
