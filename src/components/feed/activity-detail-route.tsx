"use client"

import { useEffect } from "react"
import { FileQuestion } from "lucide-react"
import { useActivity } from "@/hooks/use-activity"
import ActivityDetail from "@/components/feed/activity-detail"
import Banner from "@/components/ui/banner"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import ErrorMessage from "@/components/ui/error-message"
import NotFoundMarker from "@/components/layout/not-found-marker"
import PageContainer from "@/components/ui/page-container"
import { RecordDetailSkeleton } from "@/components/feed/cert-detail-parts"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

/**
 * Activity (cert) detail body, rendered by the handle-forward record route
 * `/{actor}/activity/{rkey}`. The actor is resolved to a DID + handle by the
 * parent route; this component fetches and renders the record.
 *
 * `resolving` is true while the parent is still turning the actor segment
 * into a DID; we stay in the loading state instead of flashing "not found".
 * An activity that doesn't exist says so (no retry: it can't succeed); one
 * that couldn't be read is an inline block with "Try again".
 *
 * Every state renders inside `<PageContainer>` (the page frame: width,
 * gutters, top and bottom space), so the page doesn't jump between them.
 */
export default function ActivityDetailRoute({
  did,
  handle,
  rkey,
  resolving,
}: {
  did: string | null
  handle: string | null
  rkey: string | null
  resolving: boolean
}) {
  const { activity, isLoading, error, refetch } = useActivity(did, rkey)

  // Recently-viewed: record the at:// URI once the cert resolves so the
  // /explore "Recently viewed" filter can surface it later.
  useEffect(() => {
    if (activity?.uri) trackRecentlyViewed("cert", activity.uri)
  }, [activity?.uri])

  if (resolving || isLoading) {
    return (
      <PageContainer>
        <RecordDetailSkeleton label="Loading activity" />
      </PageContainer>
    )
  }

  if (error && error !== "Activity not found") {
    // Fixed copy; the hook's error only picks the state, so no technical
    // text reaches the page.
    return (
      <PageContainer>
        <ErrorMessage
          title="Couldn't load this activity"
          message="Its account's server didn't answer. Try again in a moment."
          onRetry={refetch}
        />
      </PageContainer>
    )
  }

  if (!activity) {
    return (
      <PageContainer>
        <NotFoundMarker />
        <EmptyState
          icon={FileQuestion}
          title="Activity not found"
          description="It may have been deleted, or the link is wrong."
          headingLevel={2}
        >
          <Button href="/explore" variant="secondary" size="sm">
            Go to Explore
          </Button>
        </EmptyState>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {activity.partial && (
        <Banner variant="warning" title="Showing limited details" className="mb-6">
          We couldn&apos;t reach this record&apos;s home server, so some fields
          (contributors, locations, the full description and rights) may be
          missing. Try again later to see everything.
        </Banner>
      )}
      <ActivityDetail
        did={activity.did}
        value={activity.value}
        cid={activity.cid}
        handle={handle}
      />
    </PageContainer>
  )
}
