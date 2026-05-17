"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Award, Calendar, Clock, FileText, Target } from "lucide-react"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
  workScopeToLabel,
} from "@/lib/atproto/activity"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformation } from "@/hooks/use-contributor-information"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import ActivityAuthor from "./activity-author"
import LocationCard from "./location-card"
import type {
  ActivityContributor as ActivityContributorType,
  ClaimActivity,
} from "@/lib/atproto/activity-types"

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
}

/**
 * Stable React key for a contributor row. Contributors carry no id of
 * their own, so we use the strong-ref URI / inline identity plus the
 * position to disambiguate duplicates — avoids the `key={i}` antipattern.
 */
function contributorKey(c: ActivityContributorType, index: number): string {
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
 * Extract role text defensively. The lexicon types this as an object
 * but some records store it as a bare string. `"role" in details`
 * throws when `details` is a primitive, so we type-check at runtime.
 */
function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

/**
 * Decide whether `description` is a renderable plain string. The lexicon
 * supports a structured (facet-like) form too — fall through to the raw
 * details block for anything that isn't a simple string.
 */
function plainDescription(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value
  return null
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

/**
 * Detail view of a single activity claim. Renders a showcase-style layout
 * (Notion/Behance/GitHub README feel): byline, full-width 16:9 hero,
 * full-width headline, then a two-column body — main column carries the
 * long-form description + locations, sidebar carries the small metadata
 * (Created / Time period / Work scope / Rights) and the contributors
 * list. The grid collapses to a single column under ~720px.
 *
 * The `.cert-detail--wide` modifier on the root opts this page's
 * `.app-shell__content` parent into a 960px max-width via a `:has()`
 * rule in `cert-detail.css` — scoped, so every other page keeps the
 * 600px reading cap.
 */
export default function ActivityDetail({ did, value }: ActivityDetailProps) {
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, did) : null

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  const workScopeLabel = workScopeToLabel(value.workScope)

  // Time period rendering:
  //   - both set    → "Jan 1, 2026 – Mar 15, 2026"
  //   - only start  → "Jan 1, 2026 (ongoing)"
  //   - only end    → "Until Mar 15, 2026"
  //   - neither     → "Unspecified"
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

  const contributors = value.contributors ?? []
  const contributorCount = contributors.length
  const description = plainDescription(value.description)
  const hasRawDescription = value.description != null && description === null
  const locations = value.locations ?? []

  return (
    <article className="cert-detail cert-detail--wide">
      <header className="cert-detail__header">
        <ActivityAuthor did={did} />
      </header>

      {imageUrl && !imageFailed ? (
        <div className="cert-detail__hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="cert-detail__hero-img"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <div
          className="cert-detail__hero cert-detail__hero--placeholder"
          aria-hidden="true"
        >
          <Award
            size={56}
            strokeWidth={1.25}
            className="cert-detail__hero-placeholder-icon"
          />
        </div>
      )}

      <div className="cert-detail__headline">
        <h1 className="cert-detail__title">{value.title}</h1>

        {value.shortDescription ? (
          <p className="cert-detail__short-desc">{value.shortDescription}</p>
        ) : null}
      </div>

      <div className="cert-detail__body">
        <div className="cert-detail__main">
          {description ? (
            <section className="cert-detail__section">
              <h2 className="cert-detail__section-title">Description</h2>
              <p className="cert-detail__description">{description}</p>
            </section>
          ) : hasRawDescription ? (
            <section className="cert-detail__section">
              <details className="cert-detail__description-raw">
                <summary>Full description</summary>
                <pre>{JSON.stringify(value.description, null, 2)}</pre>
              </details>
            </section>
          ) : null}

          {locations.length > 0 ? (
            <section className="cert-detail__section">
              <div className="cert-detail__section-header">
                <h2 className="cert-detail__section-title">Locations</h2>
                <span className="cert-detail__section-count">
                  {locations.length}
                </span>
              </div>
              <ul className="cert-detail__locations">
                {locations.map((loc, i) => (
                  <LocationCard key={`${loc.uri}-${i}`} uri={loc.uri} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="cert-detail__sidebar">
          <dl className="cert-detail__meta">
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Clock size={11} strokeWidth={2} aria-hidden />
                Created
              </dt>
              <dd className="cert-detail__meta-value">
                <time dateTime={value.createdAt} title={createdAbsolute}>
                  {createdAbsolute}
                </time>
                <span className="cert-detail__meta-aux">
                  ({createdRelative})
                </span>
              </dd>
            </div>

            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Calendar size={11} strokeWidth={2} aria-hidden />
                Time period
              </dt>
              <dd className="cert-detail__meta-value">{timePeriodLabel}</dd>
            </div>

            {workScopeLabel ? (
              <div className="cert-detail__meta-row">
                <dt className="cert-detail__meta-label">
                  <Target size={11} strokeWidth={2} aria-hidden />
                  Work scope
                </dt>
                <dd className="cert-detail__meta-value">{workScopeLabel}</dd>
              </div>
            ) : null}

            {value.rights ? (
              <div className="cert-detail__meta-row">
                <dt className="cert-detail__meta-label">
                  <FileText size={11} strokeWidth={2} aria-hidden />
                  Rights
                </dt>
                <dd className="cert-detail__meta-value cert-detail__uri">
                  {value.rights.uri}
                </dd>
              </div>
            ) : null}
          </dl>

          {contributorCount > 0 ? (
            <section className="cert-detail__section cert-detail__section--sidebar">
              <div className="cert-detail__section-header">
                <h2 className="cert-detail__section-title">Contributors</h2>
                <span className="cert-detail__section-count">
                  {contributorCount}
                </span>
              </div>
              <ul className="cert-detail__contributors">
                {contributors.map((c, i) => {
                  const roleText = contributionRoleText(c.contributionDetails)
                  return (
                    <ContributorRow
                      key={contributorKey(c, i)}
                      contributor={c}
                      role={roleText}
                      weight={c.contributionWeight ?? null}
                    />
                  )
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  )
}

/* ---------- Contributor row ----------
 *
 * Compact row for the cert detail contributors grid. Resolves the
 * contributor identity the same way `ActivityContributor` does — see
 * `useContributorInfo` / `useContributorInformation` — but renders with
 * the `cert-detail__contributor-*` class set so it inherits the new
 * pill-hover styling rather than the older `activity-detail__contributor-*`
 * rules in feed.css.
 */

interface ContributorRowProps {
  readonly contributor: ActivityContributorType
  readonly role: string | null
  readonly weight: string | null
}

function classifyContributorIdentity(id: unknown): {
  inlineIdentity: string | null
  strongRefUri: string | null
} {
  if (id == null) return { inlineIdentity: null, strongRefUri: null }
  if (typeof id === "string") {
    return { inlineIdentity: id, strongRefUri: null }
  }
  if (typeof id !== "object") {
    return { inlineIdentity: null, strongRefUri: null }
  }
  const obj = id as Record<string, unknown>
  if (typeof obj.identity === "string") {
    return { inlineIdentity: obj.identity, strongRefUri: null }
  }
  if (typeof obj.uri === "string" && obj.uri.startsWith("at://")) {
    return { inlineIdentity: null, strongRefUri: obj.uri }
  }
  return { inlineIdentity: null, strongRefUri: null }
}

function ContributorRow({ contributor, role, weight }: ContributorRowProps) {
  const { inlineIdentity, strongRefUri } = classifyContributorIdentity(
    contributor.contributorIdentity,
  )

  const { record: contribInfo, isLoading: contribInfoLoading } =
    useContributorInformation(strongRefUri)

  const atprotoCandidate =
    inlineIdentity ??
    (contribInfo?.identifier && isAtprotoIdentity(contribInfo.identifier)
      ? contribInfo.identifier
      : null)

  const { info, isLoading: atprotoLoading } =
    useContributorInfo(atprotoCandidate)

  const isLoading = contribInfoLoading || atprotoLoading

  const fallbackLabel = strongRefUri ? "Unknown contributor" : "Anonymous"
  const displayName =
    info?.displayName ||
    contribInfo?.displayName ||
    (inlineIdentity && !isAtprotoIdentity(inlineIdentity)
      ? inlineIdentity
      : null) ||
    fallbackLabel

  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const avatarUrl = info?.avatarUrl || contribInfo?.image?.uri || null
  const profileHref = info?.did
    ? `/profile/${encodeURIComponent(info.handle || info.did)}`
    : null
  const initials = getInitials(
    info?.displayName || contribInfo?.displayName || null,
    info?.did || null,
  )

  const hasAnyHydratedField =
    !!info?.did ||
    !!contribInfo?.displayName ||
    !!contribInfo?.image?.uri ||
    !!inlineIdentity

  if (isLoading && !hasAnyHydratedField) {
    return (
      <li
        className="cert-detail__contributor cert-detail__contributor--skeleton"
        aria-hidden="true"
      >
        <div className="cert-detail__contributor-avatar-skel" />
        <div className="cert-detail__contributor-meta">
          <div className="cert-detail__contributor-name-skel" />
          <div className="cert-detail__contributor-handle-skel" />
        </div>
        {weight ? (
          <span className="cert-detail__contributor-weight">{weight}</span>
        ) : null}
      </li>
    )
  }

  const body = (
    <>
      <Avatar
        size="sm"
        src={avatarUrl || undefined}
        alt=""
        fallbackInitials={initials}
      />
      <span className="cert-detail__contributor-meta">
        <span className="cert-detail__contributor-name">
          {displayName}
          {role ? (
            <span className="cert-detail__contributor-role"> · {role}</span>
          ) : null}
        </span>
        {handle ? (
          <span className="cert-detail__contributor-handle">@{handle}</span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="cert-detail__contributor">
      {profileHref ? (
        <Link
          href={profileHref}
          className="cert-detail__contributor-link"
          aria-label={`View ${displayName}'s profile`}
        >
          {body}
        </Link>
      ) : (
        <span className="cert-detail__contributor-link cert-detail__contributor-link--static">
          {body}
        </span>
      )}
      {weight ? (
        <span className="cert-detail__contributor-weight">{weight}</span>
      ) : null}
    </li>
  )
}
