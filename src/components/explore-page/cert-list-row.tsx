"use client"

import { useState } from "react"
import Link from "next/link"
import { Award } from "lucide-react"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
} from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import ActivityAuthor from "@/components/feed/activity-author"

/**
 * Dense single-row representation of a cert for the /explore list
 * view. Same data as <ActivityCard>, laid out horizontally so many
 * certs fit on screen at once.
 *
 *   [thumb] [ title                              ] [ author ] [date]
 *           [ shortDescription                   ]
 */
export default function CertListRow({
  record,
  did,
}: {
  record: ActivityRecord
  did: string
}) {
  const { value } = record
  const imageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null
  const [imageFailed, setImageFailed] = useState(false)

  const parsed = parseActivityUri(record.uri)
  const detailHref = parsed
    ? activityDetailHref(parsed.did, parsed.rkey)
    : null

  return (
    <article className="cert-list-row">
      {detailHref ? (
        <Link href={detailHref} className="cert-list-row__link">
          <div className="cert-list-row__thumb">
            {imageUrl && !imageFailed ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="cert-list-row__img"
                src={imageUrl}
                alt=""
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Award
                size={20}
                strokeWidth={1.25}
                aria-hidden
                className="cert-list-row__img-fallback"
              />
            )}
          </div>
          <div className="cert-list-row__body">
            <h3 className="cert-list-row__title">{value.title}</h3>
            {value.shortDescription ? (
              <p className="cert-list-row__desc">{value.shortDescription}</p>
            ) : null}
          </div>
        </Link>
      ) : null}

      <div className="cert-list-row__aside">
        {did ? (
          <div className="cert-list-row__author">
            <ActivityAuthor did={did} />
          </div>
        ) : null}
        <time className="cert-list-row__time">
          {formatRelativeTime(value.createdAt)}
        </time>
      </div>
    </article>
  )
}
