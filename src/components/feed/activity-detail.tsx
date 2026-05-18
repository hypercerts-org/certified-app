"use client"

import { useEffect, useState } from "react"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
  workScopeToLabel,
} from "@/lib/atproto/activity"
import ActivityAuthor from "./activity-author"
import ActivityContributor from "./activity-contributor"
import LocationCard from "./location-card"
import type { ClaimActivity } from "@/lib/atproto/activity-types"

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
}

/**
 * Build a stable React key for a contributor row. Contributors don't
 * have their own id, so we prefer the strong-ref URI (unique within a
 * record) or the inline identity string; a position-based suffix
 * disambiguates duplicates. Avoids the `key={i}` antipattern that
 * breaks reconciliation on list mutation.
 */
function contributorKey(
  c: ClaimActivity["contributors"] extends Array<infer T> | undefined
    ? T
    : never,
  index: number
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

/**
 * Extract the displayable role text for a contribution, defensively.
 *
 * The lexicon types `contributionDetails` as `ContributorRole | StrongRef`
 * — always an object — but some records in the wild store it as a bare
 * string. The narrowing `"role" in details` throws a TypeError when the
 * right-hand operand is a primitive, so we type-check at runtime first.
 */
function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

/**
 * Full-detail view of a single activity claim. Shows every field on the
 * record. Rendered inside the /activity/[did]/[rkey] route.
 */
export default function ActivityDetail({ did, value }: ActivityDetailProps) {
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, did) : null

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  const workScopeLabel = workScopeToLabel(value.workScope)

  // Combine start + end into a single "time period" label. The cases:
  //   - both set             → "Jan 1, 2026 – Mar 15, 2026"
  //   - only start           → "Jan 1, 2026 (ongoing)"
  //   - only end             → "Until Mar 15, 2026"
  //   - neither              → "Unspecified"
  const startDate = value.startDate ? formatDate(value.startDate) : null
  const endDate = value.endDate ? formatDate(value.endDate) : null
  let timePeriodLabel: string
  if (startDate && endDate) {
    timePeriodLabel = `${startDate} – ${endDate}`
  } else if (startDate) {
    timePeriodLabel = `${startDate} (ongoing)`
  } else if (endDate) {
    timePeriodLabel = `Until ${endDate}`
  } else {
    timePeriodLabel = "Unspecified"
  }

  const createdAbsolute = formatDate(value.createdAt)
  const createdRelative = formatRelativeTime(value.createdAt)

  const contributorCount = value.contributors?.length ?? 0

  return (
    <article className="activity-detail">
      <ActivityAuthor did={did} />

      {imageUrl && !imageFailed ? (
        <div className="activity-detail__image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="activity-detail__image"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : null}

      <h1 className="activity-detail__title">{value.title}</h1>

      {value.shortDescription ? (
        <p className="activity-detail__short-desc">{value.shortDescription}</p>
      ) : null}

      <dl className="activity-detail__meta">
        <div className="activity-detail__meta-row">
          <dt>Created</dt>
          <dd>
            <time dateTime={value.createdAt} title={createdAbsolute}>
              {createdAbsolute}
            </time>{" "}
            <span className="activity-detail__meta-aux">({createdRelative})</span>
          </dd>
        </div>

        <div className="activity-detail__meta-row">
          <dt>Time period</dt>
          <dd>{timePeriodLabel}</dd>
        </div>

        {workScopeLabel ? (
          <div className="activity-detail__meta-row">
            <dt>Work scope</dt>
            <dd>{workScopeLabel}</dd>
          </div>
        ) : null}

        {contributorCount > 0 ? (
          <div className="activity-detail__meta-row">
            <dt>Contributors</dt>
            <dd>
              <ul className="activity-detail__contributors">
                {value.contributors!.map((c, i) => {
                  const roleText = contributionRoleText(c.contributionDetails)
                  return (
                    <ActivityContributor
                      key={contributorKey(c, i)}
                      contributor={c}
                      role={roleText}
                      weight={c.contributionWeight ?? null}
                    />
                  )
                })}
              </ul>
            </dd>
          </div>
        ) : null}

        {value.locations && value.locations.length > 0 ? (
          <div className="activity-detail__meta-row">
            <dt>Locations</dt>
            <dd>
              <ul className="location-list">
                {value.locations.map((loc, i) => (
                  <LocationCard key={`${loc.uri}-${i}`} uri={loc.uri} />
                ))}
              </ul>
            </dd>
          </div>
        ) : null}

        {value.rights ? (
          <div className="activity-detail__meta-row">
            <dt>Rights</dt>
            <dd className="activity-detail__uri">{value.rights.uri}</dd>
          </div>
        ) : null}
      </dl>

      {/* Long-form description — rendered as plain text for now. Rich
          content is stored as a facet-like structure that we don't yet
          know how to render safely, so we stringify it and surface it
          in a collapsible details block so curious users can still see
          the raw payload without it dominating the page. */}
      {value.description ? (
        <details className="activity-detail__raw">
          <summary>Full description</summary>
          <pre>{JSON.stringify(value.description, null, 2)}</pre>
        </details>
      ) : null}
    </article>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return iso
  }
}
