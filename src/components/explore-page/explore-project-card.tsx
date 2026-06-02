"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderGit2 } from "lucide-react"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Compact project card for the /explore Projects grid. Light-weight
 * cousin of <ProjectBox> in profile-projects — same data shape, but
 * doesn't resolve items (the grid renders many cards; N-times-K item
 * resolution would be wasteful).
 */
export default function ExploreProjectCard({
  project,
}: {
  project: CollectionRecord
}) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const projectDid = parsed?.did ?? ""
  const detailHref = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : "#"

  const title =
    asString(value.title) || asString(value.name) || "Untitled project"
  const shortDesc = asString(value.shortDescription)
  const createdAt = asString(value.createdAt)
  const createdLabel = createdAt ? formatShortDate(createdAt) : null

  const rawImage = (value as Record<string, unknown>).banner ?? value.image
  const imageUrl =
    rawImage && projectDid
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          projectDid,
        )
      : null
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = !!imageUrl && !imageFailed

  const itemCount = countItems(value.items)

  return (
    <Link href={detailHref} className="explore-project-card">
      <div className="explore-project-card__image-wrap">
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl!}
            alt=""
            className="explore-project-card__image"
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className="explore-project-card__image explore-project-card__image--placeholder">
            <FolderGit2 size={28} strokeWidth={1.25} aria-hidden />
          </div>
        )}
      </div>
      <div className="explore-project-card__body">
        <h3 className="explore-project-card__title">{title}</h3>
        {shortDesc ? (
          <p className="explore-project-card__desc">{shortDesc}</p>
        ) : null}
        <div className="explore-project-card__meta">
          <span className="explore-project-card__count">
            {itemCount} {itemCount === 1 ? "activity" : "activities"}
          </span>
          {createdLabel ? (
            <span className="explore-project-card__when">{createdLabel}</span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function countItems(items: unknown): number {
  return Array.isArray(items) ? items.length : 0
}
