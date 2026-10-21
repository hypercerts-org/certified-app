"use client"

import { useEffect, useRef } from "react"
import { AlertCircle, Inbox } from "lucide-react"
import ActivityCard from "./activity-card"
import ActivityCardSkeleton from "./activity-card-skeleton"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { LabelValue } from "@/lib/atproto/labeller"

type LabelMap = Map<string, LabelValue>

export interface FeedLayoutProps {
  activities: ActivityRecord[]
  /** Map from activity URI to author DID. Consumers back this with a
   *  per-URI lookup and fall back to the surface's primary DID. */
  getDid: (uri: string) => string
  labels?: LabelMap
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  /** Custom empty state to show instead of the default. */
  emptyState?: React.ReactNode
  /** Re-runs the initial load; shows a "Try again" button on error. */
  onRetry?: () => void
}

/**
 * Shared feed renderer used by the cert-list surfaces (profile-certs
 * and project-detail). Handles loading skeletons, empty state, error
 * state, and the infinite-scroll intersection observer at the bottom of
 * the list.
 *
 * Exported so each consumer only has to worry about data fetching and
 * can funnel through the same rendering path.
 */
export default function FeedLayout({
  activities,
  getDid,
  labels,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  loadMore,
  emptyState,
  onRetry,
}: FeedLayoutProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(loadMore)
  const hasMoreRef = useRef(hasMore)
  const isLoadingMoreRef = useRef(isLoadingMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore }, [isLoadingMore])

  // Re-attach the observer whenever the feed transitions into its
  // rendered state (activities loaded, no error). The previous version
  // only ran this once at mount, which meant if the component first
  // mounted with isLoading=true, the sentinel wasn't in the DOM yet and
  // the observer never got attached.
  useEffect(() => {
    if (isLoading || error) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreRef.current &&
          !isLoadingMoreRef.current
        ) {
          loadMoreRef.current()
        }
      },
      { rootMargin: "200px" }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isLoading, error, activities.length])

  if (isLoading) {
    return (
      <div className="feed">
        <ActivityCardSkeleton />
        <ActivityCardSkeleton />
        <ActivityCardSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="feed">
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load activities"
          description="Something went wrong on our side. Try again in a moment."
        >
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </EmptyState>
      </div>
    )
  }

  if (activities.length === 0) {
    if (emptyState) {
      return <div className="feed">{emptyState}</div>
    }
    return (
      <div className="feed">
        <EmptyState
          icon={Inbox}
          title="No activities yet"
          description="Activities people publish will appear here."
        />
      </div>
    )
  }

  return (
    <div className="feed">
      {activities.map((record) => {
        if (!record?.value) return null
        const authorDid = getDid(record.uri)
        return (
          <ActivityCard
            key={record.uri}
            record={record}
            did={authorDid}
            label={labels?.get(record.uri)}
          />
        )
      })}

      <div ref={sentinelRef} className="feed__sentinel">
        {isLoadingMore && <ActivityCardSkeleton />}
      </div>
    </div>
  )
}
