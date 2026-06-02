"use client"

import { useState, type ReactNode } from "react"
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
}: ExploreListRowProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = thumbUrl !== null && !imageFailed

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
          <p className="cert-list-row__meta">
            {metaItems.map((item, i) => (
              <span key={i} className="cert-list-row__meta-item">
                {i > 0 ? (
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
    <article className="cert-list-row">
      {href ? (
        <Link href={href} className="cert-list-row__link">
          {body}
        </Link>
      ) : null}

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
    </article>
  )
}
