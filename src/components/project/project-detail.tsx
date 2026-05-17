"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Award, FolderGit2 } from "lucide-react"
import ActivityAuthor from "@/components/feed/activity-author"
import ActivityContributor from "@/components/feed/activity-contributor"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useProjectItems } from "@/hooks/use-project-items"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import {
  activityDetailHref,
  parseActivityUri,
} from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import type { CollectionValue } from "@/lib/atproto/collection"
import type {
  ActivityContributor as ActivityContributorType,
  ActivityRecord,
} from "@/lib/atproto/activity-types"

interface ProjectDetailProps {
  did: string
  value: CollectionValue
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * Flatten the structured `description` (leaflet blocks) into a plain
 * paragraph string. Project records authored in this app store
 * description as `{ blocks: [{ block: { plaintext, ... } }, ...] }`;
 * any node we don't know how to render falls through to the raw
 * `<details>` block so curious users can still see the payload.
 */
function plainDescription(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return value.trim() ? value : null
  if (typeof value !== "object") return null
  const obj = value as Record<string, unknown>
  const blocks = obj.blocks
  if (!Array.isArray(blocks)) return null
  const lines: string[] = []
  for (const entry of blocks) {
    if (!entry || typeof entry !== "object") continue
    const block = (entry as Record<string, unknown>).block
    if (!block || typeof block !== "object") continue
    const plaintext = (block as Record<string, unknown>).plaintext
    if (typeof plaintext === "string" && plaintext.trim()) {
      lines.push(plaintext)
    }
  }
  return lines.length > 0 ? lines.join("\n\n") : null
}

function contributorKey(
  c: ActivityContributorType,
  index: number,
): string {
  const id = c.contributorIdentity as unknown
  if (id && typeof id === "object") {
    const obj = id as Record<string, unknown>
    if (typeof obj.uri === "string") return `${obj.uri}#${index}`
    if (typeof obj.identity === "string") return `${obj.identity}#${index}`
  }
  if (typeof id === "string") return `${id}#${index}`
  return `contributor-${index}`
}

function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

/**
 * Compact single-row representation of a cert that belongs to this
 * project. Deliberately not `<ActivityCard>` — we want a denser, more
 * secondary visual treatment so the project hero/description above
 * stays dominant. Pattern is close to a GitHub repo file row or a
 * Behance "more from this project" thumbnail.
 */
function ProjectCertRow({
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
  const [imageFailed, setImageFailed] = useState(false)

  const parsed = parseActivityUri(record.uri)
  const href = parsed ? activityDetailHref(parsed.did, parsed.rkey) : null

  const inner = (
    <>
      {imageUrl && !imageFailed ? (
        <span className="project-cert-row__thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="project-cert-row__thumb-img"
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </span>
      ) : (
        <span
          className="project-cert-row__thumb project-cert-row__thumb--placeholder"
          aria-hidden="true"
        >
          <Award size={20} strokeWidth={1.5} />
        </span>
      )}

      <span className="project-cert-row__text">
        <span className="project-cert-row__title">{value.title}</span>
        {value.shortDescription ? (
          <span className="project-cert-row__desc">
            {value.shortDescription}
          </span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="project-cert-row-item">
      {href ? (
        <Link href={href} className="project-cert-row">
          {inner}
        </Link>
      ) : (
        <span className="project-cert-row project-cert-row--static">
          {inner}
        </span>
      )}
    </li>
  )
}

/**
 * Detail view for a single `org.hypercerts.collection` project record.
 *
 * Layout reads top-down like a GitHub repo README or a Behance project
 * page: a wide hero banner, then the project's own title and
 * description take the full reading column. Contributors and dates
 * live in a small meta strip beneath the description. The certs that
 * belong to this project render last, as a compact list — small
 * thumbnail + title + short description per row — so they read as
 * secondary content rather than competing with the project itself.
 *
 * The root carries `project-detail--wide`; `project-detail.css` uses a
 * `:has()` rule to widen `.app-shell__content` only on this page
 * (mirroring the cert detail page's opt-in widening).
 */
export default function ProjectDetail({ did, value }: ProjectDetailProps) {
  const title =
    asString(value.title) || asString(value.name) || "Untitled project"

  const shortDesc = asString(value.shortDescription)
  const description = plainDescription(value.description)
  const hasRawDescription =
    value.description != null && description === null

  // Banner is the canonical project cover (largeImage). Fall back to
  // `image` for legacy records. Same shape unions as activity records,
  // so the activity resolver handles them.
  const rawImage =
    (value as Record<string, unknown>).banner ??
    (value as Record<string, unknown>).image
  const imageUrl = rawImage
    ? resolveActivityImageUrl(
        rawImage as Parameters<typeof resolveActivityImageUrl>[0],
        did,
      )
    : null

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  const createdAt = asString(value.createdAt)
  const startDate = asString(
    (value as Record<string, unknown>).startDate as unknown,
  )
  const endDate = asString(
    (value as Record<string, unknown>).endDate as unknown,
  )
  const location = asString(
    (value as Record<string, unknown>).location as unknown,
  )

  const contributors = Array.isArray(
    (value as Record<string, unknown>).contributors,
  )
    ? ((value as Record<string, unknown>).contributors as ActivityContributorType[])
    : []

  const { resolutions, isLoading: itemsLoading } = useProjectItems(value.items)

  // Time period rendering — same rules as the cert detail.
  let timePeriodLabel: string | null = null
  if (startDate && endDate) {
    timePeriodLabel = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
  } else if (startDate) {
    timePeriodLabel = `${formatShortDate(startDate)} (ongoing)`
  } else if (endDate) {
    timePeriodLabel = `Until ${formatShortDate(endDate)}`
  }

  const certCount = resolutions.length
  const hasAnyMeta =
    !!createdAt ||
    !!timePeriodLabel ||
    !!location ||
    contributors.length > 0

  return (
    <article className="project-detail project-detail--wide">
      <header className="project-detail__byline">
        <ActivityAuthor did={did} />
      </header>

      {imageUrl && !imageFailed ? (
        <div className="project-detail__hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="project-detail__hero-img"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <div
          className="project-detail__hero project-detail__hero--placeholder"
          aria-hidden="true"
        >
          <FolderGit2
            size={72}
            strokeWidth={1.25}
            className="project-detail__hero-placeholder-icon"
          />
        </div>
      )}

      <div className="project-detail__head">
        <h1 className="project-detail__title">{title}</h1>
        {shortDesc ? (
          <p className="project-detail__lead">{shortDesc}</p>
        ) : null}
      </div>

      {description ? (
        <div className="project-detail__prose">
          {description.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : hasRawDescription ? (
        <details className="project-detail__raw-desc">
          <summary>Full description</summary>
          <pre>{JSON.stringify(value.description, null, 2)}</pre>
        </details>
      ) : null}

      {hasAnyMeta ? (
        <aside className="project-detail__meta" aria-label="Project details">
          {createdAt ? (
            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">Created</span>
              <span className="project-detail__meta-value">
                <time dateTime={createdAt}>{formatShortDate(createdAt)}</time>
              </span>
            </div>
          ) : null}

          {timePeriodLabel ? (
            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">Time period</span>
              <span className="project-detail__meta-value">
                {timePeriodLabel}
              </span>
            </div>
          ) : null}

          {location ? (
            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">Location</span>
              <span className="project-detail__meta-value">{location}</span>
            </div>
          ) : null}

          {contributors.length > 0 ? (
            <div className="project-detail__meta-row project-detail__meta-row--wide">
              <span className="project-detail__meta-label">Contributors</span>
              <ul className="project-detail__contributors">
                {contributors.map((c, i) => (
                  <ActivityContributor
                    key={contributorKey(c, i)}
                    contributor={c}
                    role={contributionRoleText(c.contributionDetails)}
                    weight={c.contributionWeight ?? null}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      ) : null}

      <section className="project-detail__certs">
        <div className="project-detail__certs-header">
          <h2 className="project-detail__certs-title">Certs in this project</h2>
          <span className="project-detail__certs-count">{certCount}</span>
        </div>

        {certCount === 0 ? (
          <p className="project-detail__certs-empty">
            {itemsLoading
              ? "Loading certs…"
              : "This project doesn't reference any certs yet."}
          </p>
        ) : (
          <ul className="project-cert-list">
            {resolutions.map((r) => {
              if (!r.record || !r.did) {
                return (
                  <li
                    key={r.uri}
                    className="project-cert-row-item project-cert-row-item--loading"
                  >
                    <LoadingSpinner size="sm" />
                  </li>
                )
              }
              return (
                <ProjectCertRow
                  key={r.uri}
                  record={r.record}
                  did={r.did}
                />
              )
            })}
          </ul>
        )}
      </section>
    </article>
  )
}
