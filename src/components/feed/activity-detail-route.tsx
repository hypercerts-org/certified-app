"use client"

import { useEffect } from "react"
import { useActivity } from "@/hooks/use-activity"
import ActivityDetail from "@/components/feed/activity-detail"
import Banner from "@/components/ui/banner"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

/**
 * Activity (cert) detail body, rendered by the handle-forward record route
 * `/{actor}/activity/{rkey}`. The actor is resolved to a DID + handle by the
 * parent route; this component fetches and renders the record.
 *
 * `resolving` is true while the parent is still turning the actor segment
 * into a DID — we stay in the loading state instead of flashing "not found".
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
      <div className="cert-detail-page">
        <div className="cert-detail__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (error || !activity) {
    // A 404 from the loader means the record is gone: say so, and don't
    // offer a retry that can never succeed.
    const loadFailed = !!error && error !== "Activity not found"
    return (
      <div className="cert-detail-page">
        {/* Fixed heading and plain body; the hook's error only picks the
            heading, so no technical text reaches the page. */}
        <ErrorMessage
          title={loadFailed ? "Couldn't load this activity" : "Activity not found"}
          message="This activity may have been deleted, or its account's server is unreachable right now. Try again later."
          onRetry={loadFailed ? refetch : undefined}
        />
      </div>
    )
  }

  return (
    <div className="cert-detail-page">
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
    </div>
  )
}
