"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderGit2 } from "lucide-react"
import { resolveActivityImageUrl, formatRelativeTime } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import ActivityAuthor from "@/components/feed/activity-author"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Dense single-row representation of a project for the /explore list
 * view. Mirrors <CertListRow>'s grid:
 *
 *   [thumb] [ title             ] [ author col ] [ date ]
 *           [ short desc · N certs ]
 */
export default function ProjectListRow({
  project,
}: {
  project: CollectionRecord
}) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const did = parsed?.did ?? ""
  const detailHref = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null

  const title =
    asString(value.title) || asString(value.name) || "Untitled project"
  const shortDesc = asString(value.shortDescription)
  const createdAt = asString(value.createdAt)

  const rawImage = (value as Record<string, unknown>).banner ?? value.image
  const imageUrl =
    rawImage && did
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          did,
        )
      : null
  const [imageFailed, setImageFailed] = useState(false)

  const itemCount = countItems(value.items)
  const countLabel = `${itemCount} cert${itemCount === 1 ? "" : "s"}`
  const metaParts = [shortDesc, countLabel].filter(
    (s): s is string => !!s,
  )

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
              <FolderGit2
                size={20}
                strokeWidth={1.25}
                aria-hidden
                className="cert-list-row__img-fallback"
              />
            )}
          </div>
          <div className="cert-list-row__body">
            <h3 className="cert-list-row__title">{title}</h3>
            {metaParts.length > 0 ? (
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
              </p>
            ) : null}
          </div>
        </Link>
      ) : null}

      <div className="cert-list-row__author-col">
        {did ? <ActivityAuthor did={did} /> : null}
      </div>
      <time className="cert-list-row__time">
        {createdAt ? formatRelativeTime(createdAt) : ""}
      </time>
    </article>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function countItems(items: unknown): number {
  return Array.isArray(items) ? items.length : 0
}
