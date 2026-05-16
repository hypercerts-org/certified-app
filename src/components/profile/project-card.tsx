"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderGit2 } from "lucide-react"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
} from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { CollectionRecord } from "@/lib/atproto/collection"

interface ProjectCardProps {
  record: CollectionRecord
}

/** Pull a string out of an unknown without throwing on non-strings. */
function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * Best-effort count of cert items inside a project collection.
 *
 * `items[]` may strong-ref any atproto record (sub-collections, etc),
 * so we filter to entries whose `itemIdentifier.uri` points at
 * `org.hypercerts.claim.activity` — that's the "this is a cert"
 * discriminator. Unknown/malformed entries are skipped silently.
 */
function countCertItems(value: CollectionRecord["value"]): number {
  const items = value.items
  if (!Array.isArray(items)) return 0
  let n = 0
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const id = (item as Record<string, unknown>).itemIdentifier
    if (!id || typeof id !== "object") continue
    const uri = (id as Record<string, unknown>).uri
    if (typeof uri !== "string") continue
    const parsed = parseAtUri(uri)
    if (parsed?.collection === "org.hypercerts.claim.activity") n += 1
  }
  return n
}

/** Build the project detail URL from a collection record's at:// URI. */
function projectHrefFromUri(uri: string): string | null {
  const parsed = parseAtUri(uri)
  if (!parsed) return null
  return `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
}

/**
 * Card for a single `org.hypercerts.collection` project record.
 *
 * Records carry their cover image in `banner` (largeImage) — the same
 * blob shape the activity records use for `image`, so we route it
 * through `resolveActivityImageUrl` instead of duplicating the union
 * narrowing.
 */
export default function ProjectCard({ record }: ProjectCardProps) {
  const { value } = record

  const title =
    asString(value.title) ||
    asString(value.name) ||
    "Untitled project"

  const shortDesc = asString(value.shortDescription)

  // Project records use `banner` for the hero image (largeImage shape);
  // older records may store an `image` field for back-compat.
  const rawImage = (value as Record<string, unknown>).banner ?? value.image
  const parsed = parseAtUri(record.uri)
  const did = parsed?.did ?? ""
  const imageUrl =
    rawImage && did
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          did,
        )
      : null
  const [imageFailed, setImageFailed] = useState(false)

  const certCount = countCertItems(value)
  const createdAt = asString(value.createdAt)
  const detailHref = projectHrefFromUri(record.uri)

  const body = (
    <>
      {imageUrl && !imageFailed ? (
        <div className="project-card__image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="project-card__image"
            src={imageUrl}
            alt={title}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <div
          className="project-card__image-wrap project-card__image-wrap--placeholder"
          aria-hidden="true"
        >
          <FolderGit2
            size={40}
            strokeWidth={1.25}
            className="project-card__image-placeholder-icon"
          />
        </div>
      )}

      <h2 className="project-card__title">{title}</h2>

      {shortDesc ? <p className="project-card__desc">{shortDesc}</p> : null}

      <div className="project-card__meta">
        {createdAt ? (
          <time className="project-card__time">
            {formatRelativeTime(createdAt)}
          </time>
        ) : null}

        {createdAt && certCount > 0 ? (
          <span className="project-card__meta-sep" aria-hidden="true" />
        ) : null}

        {certCount > 0 ? (
          <span className="project-card__count">
            <FolderGit2
              size={11}
              strokeWidth={2}
              className="project-card__count-icon"
              aria-hidden
            />
            {certCount} cert{certCount !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
    </>
  )

  return (
    <article className="project-card">
      {detailHref ? (
        <Link href={detailHref} className="project-card__body">
          {body}
        </Link>
      ) : (
        <div className="project-card__body">{body}</div>
      )}
    </article>
  )
}
