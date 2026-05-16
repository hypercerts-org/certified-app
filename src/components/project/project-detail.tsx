"use client"

import { useEffect, useState } from "react"
import { FolderGit2 } from "lucide-react"
import ActivityAuthor from "@/components/feed/activity-author"
import ActivityCard from "@/components/feed/activity-card"
import ActivityContributor from "@/components/feed/activity-contributor"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useProjectItems } from "@/hooks/use-project-items"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { formatShortDate } from "@/lib/utils/format-date"
import type { CollectionValue } from "@/lib/atproto/collection"
import type {
  ActivityContributor as ActivityContributorType,
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
 * Detail view for a single `org.hypercerts.collection` project record.
 *
 * Layout: hero image + headline + items grid on the left, sidebar with
 * dates / contributors metadata on the right. Items render as the
 * regular `ActivityCard` so the visual treatment matches the Certs
 * tab and the cert detail page.
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

  return (
    <article className="project-detail">
      <header className="project-detail__header">
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
            size={56}
            strokeWidth={1.25}
            className="project-detail__hero-placeholder-icon"
          />
        </div>
      )}

      <h1 className="project-detail__title">{title}</h1>

      {shortDesc ? (
        <p className="project-detail__short-desc">{shortDesc}</p>
      ) : null}

      <div className="project-detail__layout">
        <div className="project-detail__main">
          {description ? (
            <section className="project-detail__section">
              <div className="project-detail__section-header">
                <h2 className="project-detail__section-title">About</h2>
              </div>
              <p className="project-detail__description">{description}</p>
            </section>
          ) : hasRawDescription ? (
            <section className="project-detail__section">
              <details>
                <summary>Full description</summary>
                <pre>{JSON.stringify(value.description, null, 2)}</pre>
              </details>
            </section>
          ) : null}

          <section className="project-detail__section">
            <div className="project-detail__section-header">
              <h2 className="project-detail__section-title">Certs</h2>
              <span className="project-detail__section-count">
                {resolutions.length}
              </span>
            </div>

            {resolutions.length === 0 ? (
              <p className="project-detail__items-empty">
                {itemsLoading
                  ? "Loading certs…"
                  : "This project doesn't reference any certs yet."}
              </p>
            ) : (
              <ul className="project-detail__items">
                {resolutions.map((r) => {
                  if (!r.record || !r.did) {
                    return (
                      <li key={r.uri} className="project-detail__items-loading">
                        <LoadingSpinner size="sm" />
                      </li>
                    )
                  }
                  return (
                    <li key={r.uri}>
                      <ActivityCard record={r.record} did={r.did} />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside
          className="project-detail__sidebar"
          aria-label="Project details"
        >
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

          {contributors.length > 0 ? (
            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">
                Contributors
              </span>
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
      </div>
    </article>
  )
}
