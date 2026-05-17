"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { usePageTitle, usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useActivity } from "@/hooks/use-activity"
import { useAuthorInfo } from "@/hooks/use-author-info"
import ActivityDetail from "@/components/feed/activity-detail"
import LoadingSpinner from "@/components/ui/loading-spinner"

export default function ActivityDetailPage() {
  // Plain-string fallback while author/cert data is still resolving. The
  // breadcrumb below takes precedence once both pieces are available.
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
  const { info: authorInfo } = useAuthorInfo(did)

  const handle = authorInfo?.handle ?? null
  const certTitle = activity?.value.title ?? null
  usePageTitleBreadcrumb(
    handle && certTitle && did && rkey
      ? {
          left: {
            text: handle,
            href: `/profile/${encodeURIComponent(handle)}`,
          },
          right: {
            text: certTitle,
            href: `/activity/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
          },
        }
      : null
  )

  if (isLoading) {
    return (
      <div className="cert-detail-page">
        <div className="cert-detail__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (error || !activity) {
    return (
      <div className="cert-detail-page">
        <div className="cert-detail__error">
          <p className="cert-detail__error-title">
            {error || "Activity not found"}
          </p>
          <p className="cert-detail__error-desc">
            This activity claim may have been deleted or is on a PDS we
            can&rsquo;t reach.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="cert-detail-page">
      <ActivityDetail did={activity.did} value={activity.value} />
    </div>
  )
}
