"use client"

import { memo, useState } from "react"
import Link from "next/link"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { resolveActivityImageUrl, workScopeTags } from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import { formatPeriodShort } from "@/lib/utils/format-date"

/**
 * One activity in a project ("the work"): its photo, title, a few lines of
 * its summary, and when it ran with what it covers. The Explore project
 * card's frame (bordered `--bg-elevated`, no shadow, the border darkens on
 * hover) with the activity's 16:9 photo; `layout="wide"` lays a project's
 * only activity out as one row, the photo beside the text, from 800px.
 */
function ProjectActivityCard({
  record,
  did,
  layout = "grid",
}: {
  record: ActivityRecord
  /** The activity's repo, for its image. */
  did: string
  layout?: "grid" | "wide"
}) {
  const { value } = record
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, did) : null
  const [failed, setFailed] = useState(false)
  const parsed = parseActivityUri(record.uri)
  const href = parsed ? activityDetailHref(parsed.did, parsed.rkey) : null
  const period = formatPeriodShort(value.startDate ?? null, value.endDate ?? null)
  const tags = workScopeTags(value.workScope).slice(0, 3)
  const title = value.title?.trim() || "Untitled activity"

  const body = (
    <>
      {imageUrl && !failed ? (
        <div className="record-work-card__image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        </div>
      ) : null}
      <div className="record-work-card__body">
        <h3 className="record-work-card__title" dir="auto">
          {title}
        </h3>
        {value.shortDescription ? (
          <p className="record-work-card__desc" dir="auto">
            {value.shortDescription}
          </p>
        ) : null}
        {period || tags.length > 0 ? (
          <p className="record-work-card__meta">
            {[period, tags.join(", ")].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </>
  )

  const className = `record-work-card record-work-card--${layout}${
    imageUrl && !failed ? "" : " record-work-card--no-image"
  }`
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

export default memo(ProjectActivityCard)
