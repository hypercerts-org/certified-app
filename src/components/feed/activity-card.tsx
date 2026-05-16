"use client"

import { useState } from "react"
import Link from "next/link"
import { Award } from "lucide-react"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
  workScopeToLabel,
} from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import type { LabelValue } from "@/lib/atproto/labeller"
import FeedLabelPill from "@/components/ui/feed-label-pill"
import ActivityAuthor from "./activity-author"
interface ActivityCardProps {
  record: ActivityRecord
  did: string
  label?: LabelValue
}

export default function ActivityCard({ record, did, label }: ActivityCardProps) {
  const { value } = record

  const imageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null
  const [imageFailed, setImageFailed] = useState(false)

  const contributorCount = value.contributors?.length ?? 0

  const workScopeLabel = workScopeToLabel(value.workScope)

  // Derive the detail-page URL from the record's at:// URI. We prefer
  // the URI over the `did` prop because it encodes the rkey too.
  const parsed = parseActivityUri(record.uri)
  const detailHref = parsed ? activityDetailHref(parsed.did, parsed.rkey) : null

  // Split the card into two parts:
  //  - Author byline: outside the Link, because it's its own link
  //    (profile page). Nested anchors are invalid HTML.
  //  - Everything else: wrapped in a Link to the detail page.
  const cardBody = (
    <>
      {imageUrl && !imageFailed ? (
        <div className="feed-card__image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="feed-card__image"
            src={imageUrl}
            alt={value.title || "Activity image"}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <div
          className="feed-card__image-wrap feed-card__image-wrap--placeholder"
          aria-hidden="true"
        >
          <Award size={40} strokeWidth={1.25} className="feed-card__image-placeholder-icon" />
        </div>
      )}

      <h2 className="feed-card__title">{value.title}</h2>

      {value.shortDescription && (
        <p className="feed-card__desc">{value.shortDescription}</p>
      )}

      <div className="feed-card__meta">
        {label && (
          <>
            <FeedLabelPill label={label} />
            <span className="feed-card__meta-sep" aria-hidden="true" />
          </>
        )}

        <time className="feed-card__time">
          {formatRelativeTime(value.createdAt)}
        </time>

        {contributorCount > 0 && (
          <>
            <span className="feed-card__meta-sep" aria-hidden="true" />
            <span className="feed-card__badge">
              {contributorCount} contributor{contributorCount !== 1 ? "s" : ""}
            </span>
          </>
        )}

        {workScopeLabel && (
          <>
            <span className="feed-card__meta-sep" aria-hidden="true" />
            <span className="feed-card__scope">{workScopeLabel}</span>
          </>
        )}
      </div>
    </>
  )

  return (
    <article className="feed-card">
      {did ? <ActivityAuthor did={did} /> : null}

      {detailHref ? (
        <Link href={detailHref} className="feed-card__body">
          {cardBody}
        </Link>
      ) : (
        <div className="feed-card__body">{cardBody}</div>
      )}
    </article>
  )
}
