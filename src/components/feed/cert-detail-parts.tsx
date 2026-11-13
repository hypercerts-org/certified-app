"use client"

/**
 * Presentational parts of the record pages (activity and project): the
 * record header, byline and section tabs, plus the contributor list
 * pieces. None of them share state with the pages — everything crosses
 * the seam through enumerable props.
 */

import { memo, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { FolderGit2 } from "lucide-react"
import { parseAtUri, profileUrl, recordUrl } from "@/lib/urls"
import type { DetailTab } from "@/lib/detail-tabs"
import { Tabs, TabList, Tab } from "@/components/ui/tabs"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { projectImage, projectTitle } from "@/lib/atproto/collection"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformationRecord } from "@/hooks/use-contributor-information-record"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useCertProjects } from "@/hooks/use-cert-projects"
import { formatAbsoluteDateTime } from "@/components/explore-page/format-display"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"
import { deriveIdentity } from "@/lib/utils/identity"
import Avatar from "@/components/ui/avatar"
import Skeleton from "@/components/ui/skeleton"
import type { ActivityContributor as ActivityContributorType } from "@/lib/atproto/activity-types"

/**
 * "Share" column heading over a contributors list when at least one row
 * carries a `contributionWeight`. The weight chips (each "N%") sit at the
 * rows' right edge, so the heading sits over that column; hovering shows
 * the full meaning.
 */
export function ContributorWeightHeader() {
  return (
    <div className="cert-detail__contributors-weight-header">
      <span title="Each contributor's share of the work">Share</span>
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
          <span className="cert-detail__contributor-weight">{weight}%</span>
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
        <span className="cert-detail__contributor-name" dir="auto">
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
        <span className="cert-detail__contributor-weight">{weight}%</span>
      ) : null}
    </li>
  )
})

/**
 * The head of a record page (activity or project): a small type eyebrow,
 * the record title as the page's one h1, the record's actions (the
 * owner's Edit button and the ⋯ menu) at the header's top-right, and the
 * byline below. From 800px the actions sit on the title's row; on phones
 * they move up to the eyebrow's row so the title keeps the full width.
 *
 * The page registers its header (`useRegisterPageHeader`), so the chrome
 * renders no h1 of its own.
 */
export function RecordHeader({
  kind,
  title,
  actions,
  children,
}: {
  /** The record type, shown as the eyebrow ("Activity", "Project"). */
  kind: string
  title: string
  /** Edit button and ⋯ menu, right of the title. */
  actions?: ReactNode
  /** The byline (`<RecordByline>`). */
  children?: ReactNode
}) {
  return (
    <header className="record-head">
      <p className="record-head__kind">{kind}</p>
      <h1 className="record-head__title" dir="auto">
        {title}
      </h1>
      {actions ? <div className="record-head__actions">{actions}</div> : null}
      {children}
    </header>
  )
}

/**
 * Loading placeholder for a record page (activity or project), shaped like
 * the content: the title, the byline, the tab strip, then a few lines of
 * body text. Announced once through the wrapper's `aria-label`; the bars
 * themselves are `aria-hidden` (Skeleton).
 */
export function RecordDetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton variant="line" width="4rem" height="0.75rem" />
        <Skeleton variant="line" width="min(32rem, 85%)" height="2rem" />
        <div className="flex items-center gap-2">
          <Skeleton variant="circle" width={32} height={32} />
          <Skeleton variant="line" width="10rem" height="0.875rem" />
        </div>
      </div>
      <Skeleton variant="line" width="100%" height="2.75rem" />
      <div className="flex max-w-measure flex-col gap-2">
        <Skeleton variant="line" width="100%" height="1rem" />
        <Skeleton variant="line" width="92%" height="1rem" />
        <Skeleton variant="line" width="60%" height="1rem" />
      </div>
    </div>
  )
}

/**
 * The record's section tabs (activity: Overview / Contributors / Funding /
 * Updates; project: Overview / Description / Activities / Updates), one
 * strip under the record header at every width, like the profile's tabs.
 * It scrolls sideways when the tabs don't fit (phones) and stays pinned
 * below the top bar while the page scrolls.
 *
 * Each tab is a real link (`?tab=<key>` on the current path, other query
 * params kept, so filters survive a switch) that REPLACES the history
 * entry and keeps the scroll position. Counts ride on the tab through the
 * `Tab` primitive's `count`; zero shows no count.
 */
export function RecordSectionTabs({
  tabs,
  activeKey,
  ariaLabel,
  counts,
}: {
  tabs: DetailTab[]
  activeKey: string
  ariaLabel: string
  counts?: Partial<Record<string, number>>
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stripRef = useRef<HTMLDivElement | null>(null)
  const hrefFor = (t: DetailTab): string => {
    const base = pathname ?? ""
    if (t.subRoute) return `${base}/${t.subRoute}`
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (t.key === "overview") params.delete("tab")
    else params.set("tab", t.key)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  // Keep the active tab visible in the scrolling strip (a deep link can
  // select a tab that starts off-screen on a phone). Scrolls the strip
  // only, never the page; a no-op when everything fits.
  useEffect(() => {
    const strip = stripRef.current
    const tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return
    const tabLeft =
      tab.getBoundingClientRect().left -
      strip.getBoundingClientRect().left +
      strip.scrollLeft
    const tabRight = tabLeft + tab.offsetWidth
    if (tabLeft >= strip.scrollLeft && tabRight <= strip.scrollLeft + strip.clientWidth) {
      return
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    strip.scrollTo({
      left: tabLeft < strip.scrollLeft ? tabLeft - 24 : tabRight - strip.clientWidth + 32,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }, [activeKey])

  return (
    <div ref={stripRef} className="record-tabs">
      {/* Link tabs: `value` follows the URL, so onChange has nothing to do. */}
      <Tabs value={activeKey} onChange={() => {}}>
        <TabList aria-label={ariaLabel} className="record-tabs__list">
          {tabs.map((t) => {
            const count = counts?.[t.key]
            return (
              <Tab
                key={t.key}
                value={t.key}
                href={hrefFor(t)}
                linkProps={{ replace: true, scroll: false }}
                count={count && count > 0 ? count : undefined}
                className="record-tabs__tab"
              >
                {t.label}
              </Tab>
            )
          })}
        </TabList>
      </Tabs>
    </div>
  )
}

/**
 * The byline under a record title: labelled fields in one row that wraps
 * on narrow screens — Author, Date created, then any extra fields the page
 * passes (the activity's Project).
 */
export function RecordByline({
  did,
  createdAt,
  children,
}: {
  did: string
  createdAt: string | null
  /** Extra fields after the date (each a `<RecordBylineField>`). */
  children?: ReactNode
}) {
  const { info, isLoading: authorLoading } = useAuthorInfo(did)

  return (
    <dl className="record-byline">
      <div className="record-byline__field">
        <dt className="record-byline__label">Author</dt>
        <dd className="record-byline__value">
          {authorLoading || !info ? (
            <span className="flex items-center gap-2" aria-hidden="true">
              <Skeleton variant="circle" width={24} height={24} />
              <Skeleton variant="line" width="7rem" height="0.875rem" />
            </span>
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
                    <span className="cert-detail__headline-name" dir="auto">
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
        </dd>
      </div>

      {createdAt ? (
        <div className="record-byline__field">
          <dt className="record-byline__label">Date created</dt>
          <dd className="record-byline__value">
            <time dateTime={createdAt} title={formatAbsoluteDateTime(createdAt)}>
              {formatShortDate(createdAt)}
            </time>
          </dd>
        </div>
      ) : null}

      {children}
    </dl>
  )
}

/**
 * The activity's Project field for `<RecordByline>`: the first project
 * that contains it (`useCertProjects`), with "+N" when there are more.
 * When it's in no project, owners get an "Add to project" link to their
 * Records (where activities are put into projects) and visitors see no
 * field at all.
 */
export function ActivityProjectField({
  did,
  rkey,
  canAddToProject,
}: {
  did: string
  rkey: string | null
  /** The viewer can edit this activity, so offer "Add to project". */
  canAddToProject: boolean
}) {
  const { projects, isLoading } = useCertProjects(did, rkey)

  if (isLoading) {
    return (
      <div className="record-byline__field" aria-hidden="true">
        <dt className="record-byline__label">Project</dt>
        <dd className="record-byline__value">
          <Skeleton variant="line" width="8rem" height="0.875rem" />
        </dd>
      </div>
    )
  }

  if (projects.length === 0) {
    if (!canAddToProject) return null
    return (
      <div className="record-byline__field">
        <dt className="record-byline__label">Project</dt>
        <dd className="record-byline__value">
          <Link href="/records" className="record-byline__add-link">
            Add to project
          </Link>
        </dd>
      </div>
    )
  }

  const first = projects[0]
  const remaining = projects.length - 1
  const firstParts = parseAtUri(first.uri)
  const firstHref = firstParts
    ? recordUrl(firstParts.did, "project", firstParts.rkey)
    : null
  const title = projectTitle(first.value)
  // Resolved against the project's own DID so foreign-PDS blobs come
  // through the xrpc proxy.
  const projectDid = firstParts?.did ?? ""
  const rawImage = projectImage(first.value, "thumb")
  const imageUrl =
    rawImage && projectDid ? resolveActivityImageUrl(rawImage, projectDid) : null
  const body = (
    <>
      <HeadlineProjectThumb src={imageUrl} />
      <span className="cert-detail__headline-project-title" dir="auto">
        {title}
      </span>
    </>
  )

  return (
    <div className="record-byline__field record-byline__field--grow">
      <dt className="record-byline__label">Project</dt>
      <dd className="record-byline__value cert-detail__headline-project-value">
        {firstHref ? (
          <Link href={firstHref} className="cert-detail__headline-project-link">
            {body}
          </Link>
        ) : (
          <span className="cert-detail__headline-project-link cert-detail__headline-project-link--static">
            {body}
          </span>
        )}
        {remaining > 0 ? (
          <span className="cert-detail__meta-aux"> +{remaining}</span>
        ) : null}
      </dd>
    </div>
  )
}

/** Byline project thumb: the project image, or the project icon when
 *  there is none or it fails to load — never an empty grey tile. */
function HeadlineProjectThumb({ src }: { src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return (
    <span className="cert-detail__headline-project-thumb" aria-hidden="true">
      {src && failedSrc !== src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- dynamic bsky-CDN/blob URL; next/image remotePatterns limited to **.certified.app */
        <img
          src={src}
          alt=""
          className="cert-detail__headline-project-thumb-img"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <FolderGit2 size={14} strokeWidth={1.75} />
      )}
    </span>
  )
}
