"use client"

import CertIcon from "@/components/ui/cert-icon"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  evaluateWorkScope,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import ExploreListRow from "./explore-list-row"

/**
 * Dense single-row representation of a cert. Shows only the image (or a
 * placeholder), the activity title, the time period, and the work scope
 * — no author/date columns (the compact ExploreListRow variant), so the
 * row spans the full width. Used by /explore and the project detail page.
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
      authorDid={null}
      timestampIso={null}
      compact
    />
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
