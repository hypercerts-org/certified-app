"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { usePageTitle } from "@/lib/navbar-context"
import { useActivity } from "@/hooks/use-activity"
import ActivityDetail from "@/components/feed/activity-detail"
import LoadingSpinner from "@/components/ui/loading-spinner"

export default function ActivityDetailPage() {
  usePageTitle("Activity")

  const params = useParams()
  const did = useMemo(() => {
    const raw = params.did
    if (typeof raw !== "string") return null
    return decodeURIComponent(raw)
  }, [params.did])
  const rkey = useMemo(() => {
    const raw = params.rkey
    if (typeof raw !== "string") return null
    return decodeURIComponent(raw)
  }, [params.rkey])

  const { activity, isLoading, error } = useActivity(did, rkey)

  if (isLoading) {
    return (
      <div className="activity-detail-page">
        <div className="activity-detail__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (error || !activity) {
    return (
      <div className="activity-detail-page">
        <div className="activity-detail__error">
          <p className="activity-detail__error-title">
            {error || "Activity not found"}
          </p>
          <p className="activity-detail__error-desc">
            This activity claim may have been deleted or is on a PDS we
            can&rsquo;t reach.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-detail-page">
      <ActivityDetail did={activity.did} value={activity.value} />
    </div>
  )
}
