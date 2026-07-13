"use client"

/**
 * Presentational parts of the cert detail page, extracted from
 * `activity-detail.tsx`: the contributor list pieces plus the two
 * headline variants. None of them share state with `ActivityDetail`
 * — everything crosses the seam through enumerable props.
 */

import { memo, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"
import { parseAtUri, profileUrl, recordUrl } from "@/lib/urls"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { projectImage, projectTitle } from "@/lib/atproto/collection"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformationRecord } from "@/hooks/use-contributor-information-record"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useCertProjects } from "@/hooks/use-cert-projects"
import { getInitials } from "@/lib/utils/initials"
import { deriveIdentity } from "@/lib/utils/identity"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import type { ActivityContributor as ActivityContributorType } from "@/lib/atproto/activity-types"

/**
 * Right-aligned `%` column heading rendered above a contributors
 * list when at least one row carries a `contributionWeight`. The
 * pill-shaped weight chips below align to the row's right edge, so
 * the `%` sits over that column to label what the numbers mean.
 * Hovering surfaces the full sentence via a native browser tooltip
 * (`title`); the `aria-label` mirrors the same text for AT.
 */
export function ContributorWeightHeader() {
  return (
    <div
      className="cert-detail__contributors-weight-header"
      title="Relative weight of the contribution"
      aria-label="Relative weight of the contribution"
    >
      <span aria-hidden="true">%</span>
    </div>
  )
}

/* ---------- Contributor row ----------
 *
 * Compact row for the cert detail contributors grid. Resolves the
 * contributor identity the same way `ActivityContributor` does — see
 * `useContributorInfo` / `useContributorInformationRecord` — but renders with
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

export const ContributorRow = memo(function ContributorRow({
  contributor,
  role,
  weight,
}: ContributorRowProps) {
  const { inlineIdentity, strongRefUri } = classifyContributorIdentity(
    contributor.contributorIdentity,
  )

  const { record: contribInfo, isLoading: contribInfoLoading } =
    useContributorInformationRecord(strongRefUri)

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
    ? profileUrl(info.handle || info.did)
    : null
  const initials = getInitials(
    info?.displayName || contribInfo?.displayName || null,
    handle,
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
})

/**
 * Slim headline used by every tab except Overview (Description /
 * Contributors / Funding / Updates): the activity title with the author
 * pulled onto the same row (right-aligned, no "Author" label) and the owner
 * actions (Edit / Delete) collapsed into a three-dot menu. No date-created /
 * project byline — that detail lives on the Overview tab's full headline.
 */
export function SlimTabHeadline({
  did,
  title,
  isCreator,
  editHref,
  editAsGroupLabel,
  onEditAsGroup,
  onDelete,
}: {
  did: string
  title: string
  isCreator: boolean
  editHref: string
  /** Display label of the group the viewer may edit as, or null. */
  editAsGroupLabel: string | null
  onEditAsGroup: () => void
  onDelete: () => void
}) {
  const router = useRouter()
  const { info, isLoading: authorLoading } = useAuthorInfo(did)
  const showMenu = isCreator || !!editAsGroupLabel

  const { displayName, handle, initials, profileHref } = deriveIdentity(
    info,
    did,
  )

  return (
    <header className="cert-detail__headline cert-detail__headline--slim">
      <div className="cert-detail__title-row">
        <h1 className="cert-detail__title">{title}</h1>

        {/* Author + actions sit together at the right edge; the author's
            own content stays left-aligned (avatar then name/handle). The
            trailing row stretches so the menu button matches the author's
            height. */}
        <div className="cert-slim-headline__trailing">
          {!authorLoading && info ? (
            <Link
              href={profileHref}
              className="cert-detail__headline-author cert-slim-headline__author"
              aria-label={`View ${displayName}'s profile`}
            >
              <Avatar
                size="sm"
                src={info.avatarUrl || undefined}
                alt=""
                fallbackInitials={initials}
              />
              <span className="cert-detail__headline-author-meta">
                <span className="cert-detail__headline-name">
                  {displayName}
                </span>
                {handle ? (
                  <span className="cert-detail__headline-handle">
                    @{handle}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : null}

          {showMenu ? (
            <Popover>
              <PopoverTrigger>
                <Button
                  size="icon"
                  variant="ghost"
                  className="cert-slim-headline__menu"
                  aria-label="Activity actions"
                >
                  <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end">
                {isCreator ? (
                  <PopoverItem onClick={() => router.push(editHref)}>
                    <Pencil size={14} strokeWidth={1.75} aria-hidden /> Edit
                  </PopoverItem>
                ) : (
                  <PopoverItem onClick={onEditAsGroup}>
                    <Pencil size={14} strokeWidth={1.75} aria-hidden /> Edit as{" "}
                    {editAsGroupLabel}
                  </PopoverItem>
                )}
                {isCreator ? (
                  <PopoverItem onClick={onDelete}>
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden /> Delete
                  </PopoverItem>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>
    </header>
  )
}

/**
 * Three-column byline below the cert title — invisible grid (no
 * borders, no card chrome) with three small labelled cells:
 *
 *   Date created · Author · Project
 *
 * Each cell carries the same `cert-detail__meta-label` styling used
 * in the aside meta list so the three blocks read as a peer of the
 * Work scope / Locations / Rights metadata that lives on the right.
 *
 * "Project" surfaces the first project that contains this cert
 * (via the existing `useCertProjects` hook, same data source as the
 * main-pane Projects section below — module-cached so the lookup
 * doesn't double-fire). When the cert isn't in any project the
 * column renders a quiet em-dash so the three columns stay aligned.
 *
 * Below ~640px the grid collapses to a single-column stack — the
 * column track widths can't shrink further without truncating the
 * author handle or the project title past readability.
 */
export function CertHeadlineColumns({
  did,
  rkey,
  createdAt,
  formattedDate,
  action,
}: {
  did: string
  rkey: string | null
  createdAt: string
  formattedDate: string
  /** Trailing control (the three-dot menu) shown on the author's row,
   *  right-aligned, on mobile. */
  action?: ReactNode
}) {
  const { info, isLoading: authorLoading } = useAuthorInfo(did)
  const { projects } = useCertProjects(did, rkey)

  return (
    <div className="cert-detail__headline-cols">
      <div className="cert-detail__headline-col cert-detail__headline-col--author">
        <span className="cert-detail__meta-label">Author</span>
        {authorLoading || !info ? (
          <span
            className="cert-detail__headline-col-value cert-detail__headline-col-value--skel"
            aria-hidden="true"
          />
        ) : (
          (() => {
            const { displayName, handle, initials, profileHref } =
              deriveIdentity(info, did)
            return (
              <Link
                href={profileHref}
                className="cert-detail__headline-author"
                aria-label={`View ${displayName}'s profile`}
              >
                <Avatar
                  size="sm"
                  src={info.avatarUrl || undefined}
                  alt=""
                  fallbackInitials={initials}
                />
                <span className="cert-detail__headline-author-meta">
                  <span className="cert-detail__headline-name">
                    {displayName}
                  </span>
                  {handle ? (
                    <span className="cert-detail__headline-handle">
                      @{handle}
                    </span>
                  ) : null}
                </span>
              </Link>
            )
          })()
        )}
      </div>

      {action ? (
        <div className="cert-detail__headline-action">{action}</div>
      ) : null}

      <div className="cert-detail__headline-col cert-detail__headline-col--date">
        <span className="cert-detail__meta-label">Date created</span>
        <time
          dateTime={createdAt}
          className="cert-detail__headline-col-value"
          title={createdAt}
        >
          {formattedDate}
        </time>
      </div>

      <div className="cert-detail__headline-col">
        <span className="cert-detail__meta-label">Project</span>
        {projects.length === 0 ? (
          <span className="cert-detail__headline-col-value cert-detail__meta-aux">
            —
          </span>
        ) : (
          (() => {
            // First-project preview — same scope-rule the Projects
            // section in the main pane uses (single primary
            // association for the heads-up byline). A "+N more"
            // count surfaces when the cert belongs to additional
            // projects so the reader knows to scroll down to the
            // full list.
            const first = projects[0]
            const remaining = projects.length - 1
            const firstParts = parseAtUri(first.uri)
            const firstHref = firstParts
              ? recordUrl(firstParts.did, "project", firstParts.rkey)
              : null
            const title = projectTitle(first.value)
            // Compact byline thumb — avatar-first (`projectImage`
            // thumb slot), same read as the home-feed and explore
            // rows. Resolved against the project's own DID so
            // foreign-PDS blobs come through the xrpc proxy.
            const projectDid = firstParts?.did ?? ""
            const rawImage = projectImage(first.value, "thumb")
            const imageUrl =
              rawImage && projectDid
                ? resolveActivityImageUrl(rawImage, projectDid)
                : null
            const thumb = (
              <span
                className="cert-detail__headline-project-thumb"
                aria-hidden="true"
              >
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- dynamic bsky-CDN/blob URL; next/image remotePatterns limited to **.certified.app */
                  <img
                    src={imageUrl}
                    alt=""
                    className="cert-detail__headline-project-thumb-img"
                  />
                ) : null}
              </span>
            )
            const innerBody = (
              <>
                {thumb}
                <span className="cert-detail__headline-project-title">
                  {title}
                </span>
              </>
            )
            const label = firstHref ? (
              <Link
                href={firstHref}
                className="cert-detail__headline-project-link"
              >
                {innerBody}
              </Link>
            ) : (
              <span className="cert-detail__headline-project-link cert-detail__headline-project-link--static">
                {innerBody}
              </span>
            )
            return (
              <span className="cert-detail__headline-col-value cert-detail__headline-project-value">
                {label}
                {remaining > 0 ? (
                  <span className="cert-detail__meta-aux"> +{remaining}</span>
                ) : null}
              </span>
            )
          })()
        )}
      </div>
    </div>
  )
}
