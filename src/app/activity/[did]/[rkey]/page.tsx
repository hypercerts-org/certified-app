"use client"

import { useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useActivity } from "@/hooks/use-activity"
import { useAuthorInfo } from "@/hooks/use-author-info"
import ActivityDetail from "@/components/feed/activity-detail"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

export default function ActivityDetailPage() {
  // No plain-string fallback — the breadcrumb below renders once
  // author + cert data resolve; until then the top-bar title slot
  // stays empty rather than flashing a generic "Activity" word that
  // never matches what the user clicked.

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

  // Recently-viewed: record the at:// URI once the cert resolves so the
  // /explore "Recently viewed" filter can surface it later. Keyed by
  // URI (not did/rkey) because the cache stores at:// URIs verbatim.
  useEffect(() => {
    if (activity?.uri) trackRecentlyViewed("cert", activity.uri)
  }, [activity?.uri])

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
      <ActivityDetail
        did={activity.did}
        value={activity.value}
        cid={activity.cid}
      />
    </div>
  )
}
