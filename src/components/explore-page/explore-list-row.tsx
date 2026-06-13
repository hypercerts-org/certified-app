"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import ActivityAuthor from "@/components/feed/activity-author"
import { formatRelativeTime } from "@/lib/atproto/activity"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import EndorsementRowBadge from "./endorsement-row-badge"

/**
 * Presentational shell for the dense explore-page row used by both
 * `CertListRow` and `ProjectListRow`. They render the same four-column
 * grid:
 *
 *   [thumb] [ title             ] [ author col ] [ date ]
 *           [ meta item · meta item · … ]
 *
 * The two wrappers just resolve their lexicon-specific bits
 * (which-field-is-title, which-image-precedence, which-href-builder)
 * and hand the resolved props in here. Keeping the shell purely
 * presentational means the wrappers stay focused on their own data
 * shape without re-implementing the JSX scaffolding every time.
 *
 * `metaItems` is rendered as a single `· `-separated line; pass an
 * empty array to skip the meta row entirely. Each entry is a
 * `ReactNode` so callers can mix bare strings (`"3 certs"`) with
 * icon-bearing chips (`<><MapPin /> San Francisco</>`) without the
 * shell caring which is which.
 */
export interface ExploreListRowProps {
  /** Detail-page link; null skips the linked region (used when the
   *  underlying URI couldn't be parsed). */
  href: string | null
  /** Resolved image URL — null falls back to `fallbackIcon`. */
  thumbUrl: string | null
  /** Icon shown when `thumbUrl` is null or fails to load. */
  fallbackIcon: ReactNode
  title: string
  /** Meta segments rendered as a `·`-separated line under the title.
   *  Empty array hides the meta line. */
  metaItems: ReactNode[]
  /** Author byline DID. Null hides the column. */
  authorDid: string | null
  /** Closure-graph metadata for the author DID — surfaces the
   *  endorsement-strength badge next to the author handle when the
   *  active explore filter is endorsement-based (#84). */
  endorsementMeta?: EndorsementClosureAccount
  /** ISO timestamp for the right-hand "x ago" column. Null shows
   *  nothing. */
  timestampIso: string | null
  /** Compact variant: drops the author and date columns entirely so the
   *  thumb + title/meta block spans the full row width. */
  compact?: boolean
}

export default function ExploreListRow({
  href,
  thumbUrl,
  fallbackIcon,
  title,
  metaItems,
  authorDid,
  endorsementMeta,
  timestampIso,
  compact = false,
}: ExploreListRowProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = thumbUrl !== null && !imageFailed

  // Hide the "·" separator on any meta item that wraps to a new line, so
  // a dangling dot never sits at the start (or end) of a wrapped line.
  const metaRef = useRef<HTMLParagraphElement>(null)
  const [lineStarts, setLineStarts] = useState<number[]>([])
  useEffect(() => {
    const el = metaRef.current
    if (!el) return
    const measure = () => {
      const items = Array.from(el.children) as HTMLElement[]
      const starts: number[] = []
      let prevTop: number | null = null
      items.forEach((it, i) => {
        const top = it.offsetTop
        if (prevTop === null || top > prevTop + 1) starts.push(i)
        prevTop = top
      })
      setLineStarts((prev) =>
        prev.length === starts.length && prev.every((v, i) => v === starts[i])
          ? prev
          : starts,
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [metaItems])

  const body = (
    <>
      <div className="cert-list-row__thumb">
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="cert-list-row__img"
            src={thumbUrl!}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          fallbackIcon
        )}
      </div>
      <div className="cert-list-row__body">
        <h3 className="cert-list-row__title">{title}</h3>
        {metaItems.length > 0 ? (
          <p className="cert-list-row__meta" ref={metaRef}>
            {metaItems.map((item, i) => (
              <span key={i} className="cert-list-row__meta-item">
                {i > 0 && !lineStarts.includes(i) ? (
                  <span className="cert-list-row__meta-sep" aria-hidden>
                    ·
                  </span>
                ) : null}
                {item}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </>
  )

  return (
    <article
      className={`cert-list-row${compact ? " cert-list-row--compact" : ""}`}
    >
      {href ? (
        <Link href={href} className="cert-list-row__link">
          {body}
        </Link>
      ) : null}

      {compact ? null : (
        <>
          <div className="cert-list-row__author-col">
            {authorDid ? (
              <ActivityAuthor
                did={authorDid}
                nameSuffix={
                  endorsementMeta ? (
                    <EndorsementRowBadge meta={endorsementMeta} />
                  ) : null
                }
              />
            ) : null}
          </div>
          <time className="cert-list-row__time">
            {timestampIso ? formatRelativeTime(timestampIso) : ""}
          </time>
        </>
      )}
    </article>
  )
}
