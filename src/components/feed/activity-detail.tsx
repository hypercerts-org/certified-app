"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Award, Calendar, Clock, FileText, Pencil, Target } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import {
  resolveActivityImageUrl,
  formatRelativeTime,
  evaluateWorkScope,
} from "@/lib/atproto/activity"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformation } from "@/hooks/use-contributor-information"
import { useRights } from "@/hooks/use-rights"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import CertHeadlineByline from "./cert-headline-byline"
import CertProjects from "./cert-projects"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import CertLocationsMap from "./cert-locations-map"
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
 * Detail view of a single activity claim.
 *
 * Layout:
 *   - Left aside: square cert image, optional "Project" section, then
 *     a small Created / Time period / Work scope / Rights meta list.
 *   - Main pane: title, then a date+author byline, then the full
 *     `shortDescription`, an optional disclosure to reveal the rich
 *     `description`, contributors, and a single map for all locations.
 *
 * The `.cert-detail--wide` modifier on the root opts this page's
 * `.app-shell__content` parent into a wider max-width via a `:has()`
 * rule in `cert-detail.css` — scoped, so every other page keeps the
 * 600px reading cap.
 */
export default function ActivityDetail({ did, value }: ActivityDetailProps) {
  const imageUrl = value.image ? resolveActivityImageUrl(value.image, did) : null

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  const workScopeLabel = evaluateWorkScope(value.workScope)

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
  const locations = value.locations ?? []
  const showFullDescription = isRenderableDescription(value.description)

  // ClaimActivity doesn't carry its own rkey. The page route at
  // /activity/[did]/[rkey] does, and we want to pass it to the
  // Projects section. Rather than threading another prop from the
  // page (the page file is carved out beyond the breadcrumb wiring),
  // we read the last pathname segment client-side — same value the
  // page already decoded via `useParams`.
  const rkey = useRouteRkey()

  const { name: rightsName, isLoading: rightsLoading } = useRights(
    value.rights?.uri ?? null,
  )

  // Tab strip on the top bar (back-row) drives which slice of the
  // record renders in the right pane. Keep the left aside identical
  // across all tabs.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  const activeTab: "overview" | "description" | "contributors" =
    tabParam === "description" || tabParam === "contributors"
      ? tabParam
      : "overview"

  // Edit affordance — only the creator (cert.did === session DID) can
  // act on this. We pull the URL up to the cert's id (no `?tab=...`)
  // and append `/edit` so future routes get a stable target. When the
  // viewer isn't the creator, no edit link renders.
  const { did: sessionDid } = useAuth()
  const isCreator = !!sessionDid && sessionDid === did
  const certBasePath = pathname ?? ""
  const editHref = isCreator ? `${certBasePath}/edit` : null
  const descriptionHref = pathname
    ? `${pathname}?tab=description`
    : null

  // Shared headline for every tab — title + date+author byline. The
  // shortDescription stays inside the Overview header (it's the
  // teaser that gives readers a reason to click into Description),
  // but Description and Contributors hide it to avoid duplication.
  const headline = (
    <header className="cert-detail__headline">
      <div className="cert-detail__title-row">
        <h1 className="cert-detail__title">{value.title}</h1>
        {editHref ? (
          <Link
            href={editHref}
            className="cert-detail__edit-btn"
            aria-label="Edit cert"
            title="Edit cert"
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            Edit
          </Link>
        ) : null}
      </div>
      <CertHeadlineByline
        did={did}
        createdAt={value.createdAt}
        formattedDate={createdAbsolute}
      />
      {activeTab === "overview" && value.shortDescription ? (
        <p className="cert-detail__short-desc">
          {value.shortDescription}
          {showFullDescription && descriptionHref ? (
            <>
              {" "}
              <Link
                href={descriptionHref}
                scroll={false}
                className="cert-detail__more-link"
              >
                more
              </Link>
            </>
          ) : null}
        </p>
      ) : activeTab === "overview" && showFullDescription && descriptionHref ? (
        /* No shortDescription but there's a rich description — surface
           the "more" link as a standalone affordance so readers can
           still jump to the Description tab. */
        <p className="cert-detail__short-desc">
          <Link
            href={descriptionHref}
            scroll={false}
            className="cert-detail__more-link"
          >
            Read description
          </Link>
        </p>
      ) : null}
    </header>
  )

  return (
    <article className="cert-detail cert-detail--wide">
      <aside className="cert-detail__aside" aria-label="Cert details">
        {imageUrl && !imageFailed ? (
          <div className="cert-detail__image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="cert-detail__image-img"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <div
            className="cert-detail__image cert-detail__image--placeholder"
            aria-hidden="true"
          >
            <Award size={56} strokeWidth={1.25} className="cert-detail__image-placeholder-icon" />
          </div>
        )}

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
              <span className="cert-detail__meta-aux">({createdRelative})</span>
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
              <dd className="cert-detail__meta-value">
                {rightsName ? (
                  rightsName
                ) : rightsLoading ? (
                  <span className="cert-detail__meta-aux">Loading…</span>
                ) : (
                  <span className="cert-detail__uri">{value.rights.uri}</span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </aside>

      <div className="cert-detail__main">
        {headline}

        {activeTab === "overview" ? (
          <>
            {contributorCount > 0 ? (
              <section className="cert-detail__section">
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

            {rkey ? <CertProjects did={did} rkey={rkey} /> : null}

            {locations.length > 0 ? (
              <section className="cert-detail__section">
                <div className="cert-detail__section-header">
                  <h2 className="cert-detail__section-title">Locations</h2>
                  <span className="cert-detail__section-count">
                    {locations.length}
                  </span>
                </div>
                <CertLocationsMap locations={locations} />
              </section>
            ) : null}
          </>
        ) : activeTab === "description" ? (
          <section className="cert-detail__section">
            {showFullDescription ? (
              <LeafletDocument value={value.description} did={did} />
            ) : (
              <p className="cert-detail__short-desc">
                {value.shortDescription || "No description yet."}
              </p>
            )}
          </section>
        ) : activeTab === "contributors" ? (
          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Contributors</h2>
              <span className="cert-detail__section-count">
                {contributorCount}
              </span>
            </div>
            {contributorCount > 0 ? (
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
            ) : (
              <p className="cert-detail__short-desc">No contributors listed.</p>
            )}
          </section>
        ) : null}
      </div>
    </article>
  )
}

/**
 * Read the trailing rkey segment off the current URL. The cert detail
 * page sits at `/activity/[did]/[rkey]`, so we slice the last
 * pathname segment — decoded so it matches what the page already
 * normalised through `decodeURIComponent`. Returns null until the
 * window object is available (SSR pass).
 */
function useRouteRkey(): string | null {
  const [rkey, setRkey] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const segments = window.location.pathname.split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) {
      setRkey(null)
      return
    }
    try {
      setRkey(decodeURIComponent(last))
    } catch {
      setRkey(last)
    }
  }, [])
  return rkey
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

