"use client"

import { useState } from "react"
import { MessageSquareText } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import { useContextUpdates } from "@/hooks/use-context-updates"
import {
  extractContentBlobCid,
  type ContextAttachmentRecord,
} from "@/lib/atproto/context-attachment"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { formatShortDate } from "@/lib/utils/format-date"

interface ContextUpdatesProps {
  /** at:// URI of the cert or project these updates target. */
  subjectUri: string
  /** Section heading override. Defaults to "Updates". */
  heading?: string
}

/**
 * Read-only list of `org.hypercerts.context.attachment` records with
 * `contentType === "update"` whose `subjects` include `subjectUri`.
 *
 * Renders nothing (not even an empty state) when there are no updates,
 * so the section quietly disappears from cert / project detail pages
 * whose authors haven't published any.
 */
export default function ContextUpdates({
  subjectUri,
  heading = "Updates",
}: ContextUpdatesProps) {
  const { updates, isLoading, error } = useContextUpdates(subjectUri)

  if (isLoading) {
    return (
      <section className="context-updates" aria-labelledby="context-updates-heading">
        <header className="context-updates__head">
          <h2 id="context-updates-heading" className="context-updates__heading">
            {heading}
          </h2>
        </header>
        <div className="context-updates__loading">
          <LoadingSpinner size="sm" />
        </div>
      </section>
    )
  }

  if (error) {
    // Swallow non-fatal errors — the rest of the detail page is
    // useful even when the updates list fails to load.
    return null
  }

  if (updates.length === 0) return null

  return (
    <section className="context-updates" aria-labelledby="context-updates-heading">
      <header className="context-updates__head">
        <MessageSquareText
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="context-updates__icon"
        />
        <h2 id="context-updates-heading" className="context-updates__heading">
          {heading}
        </h2>
        <span className="context-updates__count">{updates.length}</span>
      </header>
      <ul className="context-updates__list">
        {updates.map((u) => (
          <UpdateCard key={u.uri} record={u} />
        ))}
      </ul>
    </section>
  )
}

function UpdateCard({ record }: { record: ContextAttachmentRecord }) {
  const [imageFailed, setImageFailed] = useState(false)
  const { value, uri } = record
  const parsed = parseAtUri(uri)
  const authorDid = parsed?.did ?? null

  const title =
    typeof value.title === "string" && value.title.length > 0
      ? value.title
      : null
  const createdAt =
    typeof value.createdAt === "string" ? value.createdAt : null
  const createdLabel = createdAt ? formatShortDate(createdAt) : null

  // Resolve the first inline image (smallBlob) for the card hero.
  const firstImage = (value.content ?? [])
    .map((entry) => extractContentBlobCid(entry))
    .find((cid): cid is string => !!cid)
  const imageUrl =
    firstImage && authorDid
      ? buildAvatarUrlFromCid(authorDid, firstImage)
      : null

  return (
    <li className="context-updates__item">
      {imageUrl && !imageFailed ? (
        <div className="context-updates__image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="context-updates__image"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : null}
      <div className="context-updates__body">
        <header className="context-updates__item-head">
          {title ? (
            <h3 className="context-updates__title">{title}</h3>
          ) : null}
          {createdLabel ? (
            <time
              className="context-updates__when"
              dateTime={createdAt ?? undefined}
            >
              {createdLabel}
            </time>
          ) : null}
        </header>
        {value.description ? (
          <LeafletDocument
            value={value.description}
            did={authorDid ?? undefined}
            className="context-updates__doc"
            minHeadingLevel={3}
          />
        ) : null}
      </div>
    </li>
  )
}
