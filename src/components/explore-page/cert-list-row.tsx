"use client"

import { MapPin } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import {
  evaluateWorkScope,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { activityDetailHref, parseActivityUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import ExploreListRow from "./explore-list-row"

/**
 * Dense single-row representation of a cert for the /explore list
 * view. Resolves cert-shaped fields (title, period, work scope,
 * location flag, author) and hands them to `<ExploreListRow>`, which
 * owns the actual JSX scaffolding shared with `<ProjectListRow>`.
 */
export default function CertListRow({
  record,
  did,
  endorsementMeta,
}: {
  record: ActivityRecord
  did: string
  /** Closure-graph metadata for the cert AUTHOR's DID, when the
   *  active explore filter is endorsement-based (#84). */
  endorsementMeta?: EndorsementClosureAccount
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
  const hasLocation = Array.isArray(value.locations) && value.locations.length > 0

  // Meta is `[period?, scope?, locationIcon?]` joined by `·`. The
  // location segment is just the icon — certs don't surface a
  // location *name* in this row variant (the detail page does).
  const metaItems = [
    period,
    scope,
    hasLocation ? (
      <MapPin
        size={12}
        strokeWidth={1.75}
        aria-label="Has location"
        className="cert-list-row__meta-icon"
      />
    ) : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null && m !== undefined)

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
      authorDid={did}
      endorsementMeta={endorsementMeta}
      timestampIso={value.createdAt}
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
