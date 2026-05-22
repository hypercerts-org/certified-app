"use client"

import { useState } from "react"
import Link from "next/link"
import { Award, MapPin } from "lucide-react"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  evaluateWorkScope,
  formatRelativeTime,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import ActivityAuthor from "@/components/feed/activity-author"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import EndorsementRowBadge, {
  type ViaIdentityMap,
} from "./endorsement-row-badge"

/**
 * Dense single-row representation of a cert for the /explore list
 * view. Four columns on desktop:
 *
 *   [thumb] [ title             ] [ author col ] [ date ]
 *           [ period · scope · 📍 ]
 *
 *  - Title + meta line stack on the left (flex-grow).
 *  - Author has a reserved fixed-width column, left-aligned inside
 *    it so author bylines stack vertically across rows.
 *  - Time period / work-scope / location are rendered as a single
 *    inline meta line under the title.
 */
export default function CertListRow({
  record,
  did,
  endorsementMeta,
  endorsementCorroboration,
  endorsementIdentities,
}: {
  record: ActivityRecord
  did: string
  /** Closure-graph metadata for the cert AUTHOR's DID, when the
   *  active explore filter is endorsement-based (#84). */
  endorsementMeta?: EndorsementClosureAccount
  endorsementCorroboration?: Map<string, number>
  endorsementIdentities?: ViaIdentityMap
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

  const period = formatTimePeriod(value.startDate ?? null, value.endDate ?? null)
  const scope = evaluateWorkScope(value.workScope)
  const hasLocation = Array.isArray(value.locations) && value.locations.length > 0
  const metaParts = [period, scope].filter((s): s is string => !!s)

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
            {metaParts.length > 0 || hasLocation ? (
              <p className="cert-list-row__meta">
                {metaParts.map((m, i) => (
                  <span key={i} className="cert-list-row__meta-item">
                    {i > 0 ? (
                      <span
                        className="cert-list-row__meta-sep"
                        aria-hidden
                      >
                        ·
                      </span>
                    ) : null}
                    {m}
                  </span>
                ))}
                {hasLocation ? (
                  <span className="cert-list-row__meta-item">
                    {metaParts.length > 0 ? (
                      <span
                        className="cert-list-row__meta-sep"
                        aria-hidden
                      >
                        ·
                      </span>
                    ) : null}
                    <MapPin
                      size={12}
                      strokeWidth={1.75}
                      aria-label="Has location"
                      className="cert-list-row__meta-icon"
                    />
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </Link>
      ) : null}

      <div className="cert-list-row__author-col">
        {did ? (
          <ActivityAuthor
            did={did}
            handlePrefix={
              endorsementMeta &&
              endorsementCorroboration &&
              endorsementIdentities ? (
                <EndorsementRowBadge
                  meta={endorsementMeta}
                  corroboration={endorsementCorroboration}
                  identityMap={endorsementIdentities}
                />
              ) : null
            }
          />
        ) : null}
      </div>
      <time className="cert-list-row__time">
        {formatRelativeTime(value.createdAt)}
      </time>
    </article>
  )
}

function formatTimePeriod(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null
  const s = start ? formatShortDate(start) : null
  const e = end ? formatShortDate(end) : null
  if (s && e) return `${s} – ${e}`
  if (s) return `${s} (ongoing)`
  if (e) return `Until ${e}`
  return null
}
