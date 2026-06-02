"use client"

import { memo, useEffect, useState } from "react"
import Link from "next/link"
import CertIcon from "@/components/ui/cert-icon"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
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

// Memoized: loadMore replaces the activities array with a new identity, so
// every prior card would otherwise re-render. Props are stable per URI, so
// React.memo lets unchanged cards bail out of reconciliation on long lists.
function ActivityCard({ record, did, label }: ActivityCardProps) {
  const { value } = record

  const imageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null
  const [imageFailed, setImageFailed] = useState(false)
  // Reset the failure flag when the image URL changes so a reused
  // instance (record mutated in place, no remount) retries the new
  // image instead of staying on the placeholder. Mirrors the same
  // reset-on-dep-change effect in ActivityDetail / ProjectDetail.
  // The unconditional setState here is the documented false-positive
  // case for `set-state-in-effect` (see eslint.config.mjs); the sibling
  // ActivityDetail effect isn't flagged, so suppress this one to match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageFailed(false)
  }, [imageUrl])

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
          <CertIcon size={40} strokeWidth={1.25} className="feed-card__image-placeholder-icon" />
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

export default memo(ActivityCard)
