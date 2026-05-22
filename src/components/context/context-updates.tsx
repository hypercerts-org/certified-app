"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, MessageSquareText } from "lucide-react"
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
  /**
   * "overview" clamps each update's body to a few lines with an inline
   * "Read more" affordance per card; useful as a preview slot on the
   * cert / project overview tab.
   * "full" renders every update at full length — for the dedicated
   * Updates subtab.
   */
  variant?: "overview" | "full"
  /**
   * Optional href that surfaces a "See all" link in the section
   * header when variant is "overview" and there's a dedicated tab to
   * jump to (e.g. `?tab=updates`).
   */
  seeAllHref?: string | null
}

/**
 * Read-only list of `org.hypercerts.context.attachment` records with
 * `contentType === "update"` whose `subjects` include `subjectUri`.
 *
 * Renders nothing (not even an empty state) when there are no updates,
 * so the section quietly disappears from detail pages whose authors
 * haven't published any.
 */
export default function ContextUpdates({
  subjectUri,
  heading = "Updates",
  variant = "full",
  seeAllHref = null,
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

  if (updates.length === 0) {
    if (variant === "full") {
      return (
        <section
          className="context-updates context-updates--full"
          aria-labelledby="context-updates-heading"
        >
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
          </header>
          <p className="context-updates__empty">No updates yet.</p>
        </section>
      )
    }
    return null
  }

  return (
    <section
      className={
        variant === "full"
          ? "context-updates context-updates--full"
          : "context-updates context-updates--overview"
      }
      aria-labelledby="context-updates-heading"
    >
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
        {variant === "overview" && seeAllHref ? (
          <Link
            href={seeAllHref}
            replace
            scroll={false}
            className="context-updates__see-all"
          >
            See all →
          </Link>
        ) : null}
      </header>
      <ul className="context-updates__list">
        {updates.map((u) => (
          <UpdateCard key={u.uri} record={u} clamp={variant === "overview"} />
        ))}
      </ul>
    </section>
  )
}

interface UpdateCardProps {
  record: ContextAttachmentRecord
  /** When true, clamp the description to a few lines and surface a
   *  "Read more" affordance if the content overflows. */
  clamp: boolean
}

function UpdateCard({ record, clamp }: UpdateCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const docWrapRef = useRef<HTMLDivElement | null>(null)

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

  const firstImage = (value.content ?? [])
    .map((entry) => extractContentBlobCid(entry))
    .find((cid): cid is string => !!cid)
  const imageUrl =
    firstImage && authorDid
      ? buildAvatarUrlFromCid(authorDid, firstImage)
      : null

  // After render: if we're in clamp mode and the description's
  // scroll height exceeds the visible (clamped) height, surface the
  // "Read more" toggle. Re-measure when the record itself changes —
  // the description content reference identity captures the swap.
  useLayoutEffect(() => {
    if (!clamp || expanded) {
      setIsTruncated(false)
      return
    }
    const el = docWrapRef.current
    if (!el) return
    // 2px tolerance for sub-pixel rounding.
    setIsTruncated(el.scrollHeight - el.clientHeight > 2)
  }, [clamp, expanded, value.description])

  const docClass = clamp && !expanded
    ? "context-updates__doc-wrap context-updates__doc-wrap--clamped"
    : "context-updates__doc-wrap"

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
          <>
            <div ref={docWrapRef} className={docClass}>
              <LeafletDocument
                value={value.description}
                did={authorDid ?? undefined}
                className="context-updates__doc"
                minHeadingLevel={3}
              />
            </div>
            {clamp && (isTruncated || expanded) ? (
              <button
                type="button"
                className="context-updates__expand"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <>
                    Show less
                    <ChevronUp size={14} strokeWidth={1.75} aria-hidden />
                  </>
                ) : (
                  <>
                    Read more
                    <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
                  </>
                )}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}
