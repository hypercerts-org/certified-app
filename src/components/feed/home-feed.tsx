"use client"

import { useEffect, useRef } from "react"
import { AlertCircle, Inbox, LogIn, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import EmptyState from "@/components/ui/empty-state"
import ActivityCardSkeleton from "@/components/feed/activity-card-skeleton"
import FeedEventCard from "@/components/feed/feed-event-card"
import type { UseHomeFeedResult } from "@/hooks/use-home-feed"

/**
 * Home-timeline feed shell. Renders states (empty / loading / error)
 * around the actual event list. Mirrors the visual rhythm of
 * `feed-layout.tsx` (the for-you / following feed shell) without
 * inheriting its `ActivityRecord[]`-only contract.
 */
export default function HomeFeed(props: UseHomeFeedResult) {
  const {
    events,
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

  // 1. Auth loading → skeletons (we don't know yet whether to show
  // signed-out vs signed-in empty state).
  if (authLoading) {
    return (
      <div className="feed">
        <SkeletonRows />
      </div>
    )
  }

  // 2. Signed out → sign-in empty state.
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

  return (
    <div className="feed">
      {(isOversized || truncatedBySource) && (
        <div className="feed__warning" role="status">
          {isOversized
            ? "You follow more than 500 people. Showing activity from a subset."
            : "Your follow list is too large to fully sync. Some activity may be missing."}
        </div>
      )}

      {/* 3. Error — but show events too if we already loaded some. */}
      {error && events.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title={
            errorCode === "AUTHORS_FILTER_TOO_LARGE"
              ? "Follow list too large"
              : "Couldn't load your feed"
          }
          description={error}
        />
      ) : null}

      {/* 4. Loading + no events yet. */}
      {isLoading && events.length === 0 && !error ? <SkeletonRows /> : null}

      {/* 5. Signed in + no error + done loading + zero events. */}
      {!isLoading && !error && events.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No activity yet"
          description="When people you follow create certs or endorse others, you'll see it here."
        />
      ) : null}

      {/* 6. Events. */}
      {events.length > 0 ? (
        <>
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
        </>
      ) : null}

      {/* 7. Edge case: no events but no follows. Override the generic
          "no activity" with the follow-people-first prompt. */}
      {!isLoading && !error && events.length === 0 && !isOversized && !truncatedBySource ? (
        <NoFollowsHint />
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

/**
 * Inline secondary empty state — rendered alongside the primary "no
 * activity" message when the underlying cause is "user follows
 * nobody yet" rather than "follows haven't been active."
 * Visually subordinate so the user only reads it if they're confused
 * by the primary message.
 */
function NoFollowsHint() {
  return (
    <div className="feed__hint">
      <Users size={20} strokeWidth={1.5} aria-hidden="true" />
      <p>Not following anyone yet? Find people to follow on the Explore page.</p>
    </div>
  )
}
