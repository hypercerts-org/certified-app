"use client"

import { memo } from "react"
import CertIcon from "@/components/ui/cert-icon"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  evaluateWorkScope,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import { formatTimePeriod } from "@/lib/utils/format-date"
import ExploreListRow from "./explore-list-row"

/**
 * Dense single-row representation of a cert. Shows only the image (or a
 * placeholder), the activity title, the time period, and the work scope
 * — no author/date columns (the compact ExploreListRow variant), so the
 * row spans the full width. Used by /explore and the project detail page.
 */
function CertListRow({
  record,
  did,
  showByline = false,
}: {
  record: ActivityRecord
  did: string
  /** Show the author byline + createdAt date (the projects-style row,
   *  with the byline/date columns). Defaults to false — the compact,
   *  full-width variant used on the project detail page. */
  showByline?: boolean
}) {
  const { value } = record
  const imageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null

  const parsed = parseActivityUri(record.uri)
  const detailHref = parsed
    ? activityDetailHref(parsed.did, parsed.rkey)
    : null

  const period = formatTimePeriod(value.startDate ?? null, value.endDate ?? null)
  const scope = evaluateWorkScope(value.workScope)

  // Time period + work scope only, joined by `·`.
  const metaItems = [period, scope].filter(
    (m): m is string => typeof m === "string" && m.length > 0,
  )

  return (
    <ExploreListRow
      href={detailHref}
      thumbUrl={imageUrl}
      fallbackIcon={
        <CertIcon
          size={20}
          strokeWidth={1.25}
          aria-hidden
          className="cert-list-row__img-fallback"
        />
      }
      title={value.title}
      metaItems={metaItems}
      authorDid={showByline ? did : null}
      timestampIso={
        showByline && typeof value.createdAt === "string"
          ? value.createdAt
          : null
      }
      compact={!showByline}
    />
  )
}

export default memo(CertListRow)
