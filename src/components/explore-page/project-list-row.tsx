"use client"

import { memo } from "react"
import { FolderGit2, MapPin } from "lucide-react"
import { recordUrl } from "@/lib/urls"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { useLocation } from "@/hooks/use-location"
import { useAuthorInfo } from "@/hooks/use-author-info"
import {
  asString,
  projectImage,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import ExploreListRow from "./explore-list-row"

/**
 * Dense single-row representation of a project for the /explore list
 * view. Resolves project-shaped fields (title fallback chain, image
 * precedence, item count, location strongRef) and hands them to
 * `<ExploreListRow>`, which owns the JSX scaffolding shared with
 * `<CertListRow>`.
 */
function ProjectListRow({
  project,
  endorsementMeta,
}: {
  project: CollectionRecord
  /** Closure-graph metadata for the project AUTHOR's DID, when the
   *  active explore filter is endorsement-based. */
  endorsementMeta?: EndorsementClosureAccount
}) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const did = parsed?.did ?? ""
  const detailHref = parsed
    ? recordUrl(parsed.did, "project", parsed.rkey)
    : null

  const title = projectTitle(value)
  const createdAt = asString(value.createdAt)

  // Compact row thumbnail — avatar-first (`projectImage` thumb slot),
  // so the same project reads identically across feed + list surfaces.
  const rawImage = projectImage(value, "thumb")
  const imageUrl =
    rawImage && did ? resolveActivityImageUrl(rawImage, did) : null

  // Author byline for the mobile "by Display Name" subtitle. Desktop
  // keeps the avatar byline column (rendered by ExploreListRow); this
  // resolves the bare name the compact mobile row shows under the title.
  const { info: authorInfo } = useAuthorInfo(did || "")
  const authorName = authorInfo?.displayName || authorInfo?.handle || null
  const subtitle = authorName ? `by ${authorName}` : null

  const itemCount = countItems(value.items)
  const countLabel = `${itemCount} ${itemCount === 1 ? "activity" : "activities"}`
  // `value.location` comes in two shapes on the wire:
  //   - inline string (legacy / direct text), e.g. "Bern, CH"
  //   - strongRef { uri, cid } pointing at an `app.certified.location`
  //     record on the author's PDS (the canonical shape today)
  // For the strongRef variant we resolve the LocationRecord via
  // useLocation (module-cached so multiple rows pointing at the same
  // place don't double-fetch) and surface its `.name`.
  const rawLocation = (value as Record<string, unknown>).location as unknown
  const inlineLocation = asString(rawLocation)
  const locationRef =
    rawLocation && typeof rawLocation === "object"
      ? asString((rawLocation as Record<string, unknown>).uri as unknown)
      : null
  const { location: locationRecord } = useLocation(locationRef ?? "")
  const locationName =
    inlineLocation || (locationRef ? asString(locationRecord?.name) : null)

  const metaItems = [
    countLabel,
    locationName ? (
      <>
        <MapPin
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="cert-list-row__meta-icon"
        />
        {locationName}
      </>
    ) : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null && m !== undefined)

  return (
    <ExploreListRow
      href={detailHref}
      thumbUrl={imageUrl}
      fallbackIcon={
        <FolderGit2
          size={20}
          strokeWidth={1.25}
          aria-hidden
          className="cert-list-row__img-fallback"
        />
      }
      title={title}
      subtitle={subtitle}
      metaItems={metaItems}
      authorDid={did || null}
      endorsementMeta={endorsementMeta}
      timestampIso={createdAt}
    />
  )
}

export default memo(ProjectListRow)

function countItems(items: unknown): number {
  return Array.isArray(items) ? items.length : 0
}
