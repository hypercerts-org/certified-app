"use client"

/**
 * Presentational parts of the record pages (activity and project): the
 * record header (image, eyebrow, title, byline, lead), the section tabs,
 * the description, the "who's behind it" card and the contributor list
 * pieces. None of them share state with the pages; everything crosses the
 * seam through props.
 */

import { memo, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { CalendarDays, MapPin } from "lucide-react"
import { profileUrl } from "@/lib/urls"
import type { DetailTab } from "@/lib/detail-tabs"
import { Tabs, TabList, Tab } from "@/components/ui/tabs"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformationRecord } from "@/hooks/use-contributor-information-record"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useOrgMarker } from "@/hooks/use-org-marker"
import { getInitials } from "@/lib/utils/initials"
import { deriveIdentity, isMachineHandle, UNNAMED_ACCOUNT } from "@/lib/utils/identity"
import { longDescriptionPlainText } from "@/lib/leaflet/guards"
import Avatar from "@/components/ui/avatar"
import ClampedText from "@/components/ui/clamped-text"
import { FactCard } from "@/components/ui/fact-card"
import FitImage from "@/components/ui/fit-image"
import Skeleton from "@/components/ui/skeleton"
import TabStripFades from "@/components/ui/tab-strip-fades"
import { useOverflowEdges } from "@/hooks/use-overflow-edges"
import Tooltip from "@/components/ui/tooltip"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import type { ActivityContributor as ActivityContributorType } from "@/lib/atproto/activity-types"

/* ---------- Contributors ---------- */

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

export interface ContributorIdentity {
  /** The contributor's DID when they have an account. */
  did: string | null
  displayName: string
  /** `displayName` is a fallback ("Unnamed account", "Anonymous"). */
  unnamed: boolean
  handle: string | null
  avatarUrl: string | null
  initials: string
  profileHref: string | null
  /** Still resolving, with nothing to show yet: render a placeholder. */
  pending: boolean
}

/**
 * Who a contributor is, resolved the same way everywhere: an account
 * (its profile name and avatar; with no name, a handle a person chose,
 * never a machine handle), a `contributorInformation` record (its name and
 * image), or a name written into the record. A written name is shown as is
 * and gives the avatar its initials. While an
 * account is still resolving, `pending` is true, so the row shows a
 * placeholder instead of flashing "Anonymous".
 */
export function useContributorIdentity(
  contributor: ActivityContributorType,
): ContributorIdentity {
  const { inlineIdentity, strongRefUri } = classifyContributorIdentity(
    contributor.contributorIdentity,
  )
  const { record: contribInfo, isLoading: contribInfoLoading } =
    useContributorInformationRecord(strongRefUri)

  const inlineIsAccount = !!inlineIdentity && isAtprotoIdentity(inlineIdentity)
  const atprotoCandidate = inlineIsAccount
    ? inlineIdentity
    : contribInfo?.identifier && isAtprotoIdentity(contribInfo.identifier)
      ? contribInfo.identifier
      : null
  const { info, isLoading: atprotoLoading } = useContributorInfo(atprotoCandidate)

  const writtenName = inlineIdentity && !inlineIsAccount ? inlineIdentity.trim() : null
  const name = info?.displayName || contribInfo?.displayName || writtenName || null
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const readableHandle = handle && !isMachineHandle(handle) ? handle : null
  const hydrated = !!info?.did || !!name || !!contribInfo?.image?.uri
  const pending = (contribInfoLoading || atprotoLoading) && !hydrated

  return {
    did: info?.did ?? null,
    displayName:
      name ||
      readableHandle ||
      (info?.did ? UNNAMED_ACCOUNT : strongRefUri ? "Unknown contributor" : "Anonymous"),
    unnamed: !name && !readableHandle,
    handle,
    avatarUrl: info?.avatarUrl || contribInfo?.image?.uri || null,
    initials: getInitials(name, readableHandle),
    profileHref: info?.did ? profileUrl(info.handle || info.did) : null,
    pending,
  }
}

/**
 * A contributor's share of the work, at the row's trailing edge: the
 * label travels with the value ("Share 40%"), so it reads on its own at
 * any width instead of relying on a column heading above the list.
 */
function ContributorShare({ weight }: { weight: string }) {
  return (
    <span className="cert-detail__contributor-weight">
      <span className="cert-detail__contributor-weight-label">Share</span>{" "}
      {weight}%
    </span>
  )
}

interface ContributorRowProps {
  readonly contributor: ActivityContributorType
  readonly role: string | null
  readonly weight: string | null
}

/** One contributor in the Contributors list: avatar, name and role, and
 *  their share. Links to their profile when they have one. */
export const ContributorRow = memo(function ContributorRow({
  contributor,
  role,
  weight,
}: ContributorRowProps) {
  const who = useContributorIdentity(contributor)

  if (who.pending) {
    return (
      <li
        className="cert-detail__contributor cert-detail__contributor--skeleton"
        aria-hidden="true"
      >
        <div className="cert-detail__contributor-avatar-skel" />
        <div className="cert-detail__contributor-meta">
          <div className="cert-detail__contributor-name-skel" />
        </div>
        {weight ? <ContributorShare weight={weight} /> : null}
      </li>
    )
  }

  const body = (
    <>
      <Avatar
        size="sm"
        src={who.avatarUrl || undefined}
        alt=""
        fallbackInitials={who.initials}
      />
      <span className="cert-detail__contributor-meta">
        <span className="cert-detail__contributor-name" dir="auto">
          <span data-unnamed={who.unnamed || undefined}>{who.displayName}</span>
          {role ? (
            <span className="cert-detail__contributor-role"> · {role}</span>
          ) : null}
        </span>
      </span>
    </>
  )

  return (
    <li className="cert-detail__contributor">
      {who.profileHref ? (
        <Link
          href={who.profileHref}
          className="cert-detail__contributor-link"
          aria-label={`View ${who.displayName}'s profile`}
        >
          {body}
        </Link>
      ) : (
        <span className="cert-detail__contributor-link cert-detail__contributor-link--static">
          {body}
        </span>
      )}
      {weight ? <ContributorShare weight={weight} /> : null}
    </li>
  )
})

/** One avatar in the contributor stack, named by its tooltip. */
function StackAvatar({ contributor }: { contributor: ActivityContributorType }) {
  const who = useContributorIdentity(contributor)
  if (who.pending) {
    return (
      <li className="record-stack__item" aria-hidden="true">
        <Skeleton variant="circle" width={32} height={32} />
      </li>
    )
  }
  const avatar = (
    <Avatar
      size="sm"
      src={who.avatarUrl || undefined}
      alt={who.profileHref ? "" : who.displayName}
      fallbackInitials={who.initials}
    />
  )
  return (
    <li className="record-stack__item">
      <Tooltip label={who.displayName}>
        {who.profileHref ? (
          <Link
            href={who.profileHref}
            className="record-stack__link"
            aria-label={who.displayName}
          >
            {avatar}
          </Link>
        ) : (
          <span className="record-stack__link">{avatar}</span>
        )}
      </Tooltip>
    </li>
  )
}

/** A contributor's name, for the sentence under the stack. */
function ContributorName({ contributor }: { contributor: ActivityContributorType }) {
  const who = useContributorIdentity(contributor)
  if (who.pending) {
    // Inline (the sentence is a <p>): a bar the size of a short name.
    return (
      <span
        aria-hidden="true"
        className="inline-block h-3 w-20 rounded bg-[var(--overlay-weak)] align-middle"
      />
    )
  }
  return <span dir="auto">{who.displayName}</span>
}

/**
 * Contributors as a row of avatars, the first `max` of them, then
 * "+N" for the rest, and the first names in a sentence under them
 * ("Ana, Bo and 3 more"). Each avatar links to its person's profile.
 */
export function ContributorStack({
  contributors,
  max = 6,
  named = 2,
}: {
  contributors: readonly ActivityContributorType[]
  max?: number
  /** How many names the sentence spells out. */
  named?: number
}) {
  const shown = contributors.slice(0, max)
  const rest = contributors.length - shown.length
  const names = contributors.slice(0, named)
  const others = contributors.length - names.length
  return (
    <div className="flex flex-col gap-2">
      <div className="record-stack">
        <ul className="record-stack__list" aria-label="Contributors">
          {shown.map((c, i) => (
            <StackAvatar key={i} contributor={c} />
          ))}
        </ul>
        {rest > 0 ? <span className="record-stack__more">+{rest}</span> : null}
      </div>
      <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
        {names.map((c, i) => (
          <span key={i}>
            {i > 0 ? (i === names.length - 1 && others === 0 ? " and " : ", ") : null}
            <ContributorName contributor={c} />
          </span>
        ))}
        {others > 0 ? ` and ${others} more` : null}
      </p>
    </div>
  )
}

/* ---------- Header ---------- */

/**
 * The page's picture, at the top: one frame for projects and activities
 * (2:1, at most 360px tall). A photo covers it; a logo or a wide banner is
 * shown whole on `--bg-sunken` (`FitImage`). Renders nothing when there is
 * no picture or it fails to load, so the page never shows an empty frame.
 */
export function RecordImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState<string | null>(null)
  // A banner wider than the frame is shown whole; the frame then takes its
  // shape (up to 4:1) instead of leaving wide bands above and below it.
  const [banner, setBanner] = useState<{ src: string; ratio: number } | null>(null)
  if (!src || failed === src) return null
  const ratio = banner?.src === src ? Math.min(banner.ratio, 4) : null
  return (
    <div
      className="record-head__image"
      style={ratio ? { aspectRatio: `${ratio.toFixed(3)} / 1` } : undefined}
    >
      <FitImage
        src={src}
        loading="eager"
        onError={() => setFailed(src)}
        onFit={(fit, r) => setBanner(fit === "contain" && r > 2 ? { src, ratio: r } : null)}
      />
    </div>
  )
}

/**
 * The head of a record page (activity and project), the same on both and
 * laid out like the profile's: the picture on top, then the eyebrow
 * ("Project", "Activity · Part of …") over the title (the page's one h1),
 * with the actions at the top right of that block (the owner's Edit,
 * Share, More: the profile's order and buttons), the byline (who, when,
 * where) and the lead at reading width. On phones the actions are a
 * full-width row under the lead, as on the profile.
 *
 * `compact` (the other tabs, on phones): no picture and no lead, so the
 * tab's content starts on the first screen.
 *
 * The page registers its header (`useRegisterPageHeader`), so the chrome
 * renders no h1 of its own.
 */
export function RecordHeader({
  image,
  eyebrow,
  title,
  actions,
  byline,
  lead,
  compact = false,
}: {
  image?: ReactNode
  /** The record type, and for an activity its project. */
  eyebrow: ReactNode
  title: string
  /** The owner's Edit, Share, the More menu. */
  actions?: ReactNode
  /** `<RecordByline>`. */
  byline?: ReactNode
  /** The short description. */
  lead?: string | null
  compact?: boolean
}) {
  return (
    <header className={`record-head${compact ? " record-head--compact" : ""}`}>
      {image}
      <div className="record-head__top">
        <div className="record-head__titles">
          <p className="record-head__kind">{eyebrow}</p>
          <h1 className="record-head__title" dir="auto">
            {title}
          </h1>
        </div>
        {actions ? <div className="record-head__actions">{actions}</div> : null}
      </div>
      {byline}
      {lead ? (
        <p className="record-head__lead" dir="auto">
          {lead}
        </p>
      ) : null}
    </header>
  )
}

/**
 * The byline under a record title, one row that wraps: the account behind
 * the record (avatar and name, to its profile), the time period and the
 * place. Groups get the square avatar.
 */
export function RecordByline({
  did,
  period,
  place,
}: {
  did: string
  period?: string | null
  /** The place's name; `undefined` while it loads. */
  place?: string | null
}) {
  const { info, isLoading } = useAuthorInfo(did)
  const { isOrg } = useOrgMarker(did)

  let who: ReactNode
  if (isLoading || !info) {
    who = (
      <span className="flex items-center gap-2" aria-hidden="true">
        <Skeleton variant="circle" width={24} height={24} />
        <Skeleton variant="line" width="9rem" height="0.875rem" />
      </span>
    )
  } else {
    const { displayName, initials, profileHref } = deriveIdentity(info, did)
    who = (
      <Link href={profileHref} className="record-byline__who">
        <Avatar
          size="xs"
          shape={isOrg ? "square" : "circle"}
          src={info.avatarUrl || undefined}
          alt=""
          fallbackInitials={initials}
        />
        <span className="record-byline__name" dir="auto">
          {displayName}
        </span>
      </Link>
    )
  }

  return (
    <div className="record-byline">
      {who}
      {period ? (
        <span className="record-byline__item">
          <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Time period: </span>
          {period}
        </span>
      ) : null}
      {place === undefined ? (
        <span className="record-byline__item" aria-hidden="true">
          <Skeleton variant="line" width="7rem" height="0.875rem" />
        </span>
      ) : place ? (
        <span className="record-byline__item">
          <MapPin size={14} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Place: </span>
          <span dir="auto">{place}</span>
        </span>
      ) : null}
    </div>
  )
}

/**
 * Loading placeholder for a record page, shaped like it: the picture, the
 * eyebrow, title and byline, the lead, and from 1100px the rail's first
 * card beside them. Announced once through the wrapper's `aria-label`.
 */
export function RecordDetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="record-layout">
      <div className="record-layout__header flex flex-col gap-3">
        <Skeleton
          variant="box"
          width="100%"
          height="auto"
          className="aspect-[2/1] max-h-[360px]"
        />
        <Skeleton variant="line" width="4rem" height="0.75rem" />
        <Skeleton variant="line" width="min(32rem, 85%)" height="2rem" />
        <div className="flex items-center gap-2">
          <Skeleton variant="circle" width={24} height={24} />
          <Skeleton variant="line" width="10rem" height="0.875rem" />
        </div>
        <div className="flex max-w-measure flex-col gap-2">
          <Skeleton variant="line" width="100%" height="1rem" />
          <Skeleton variant="line" width="80%" height="1rem" />
        </div>
      </div>
      <div className="record-layout__rail record-layout__rail--skeleton">
        <Skeleton variant="box" width="100%" height="10rem" />
      </div>
    </div>
  )
}

/* ---------- Tabs ---------- */

/**
 * The record's section tabs, one strip under the record header at every
 * width, like the profile's. It scrolls sideways when the tabs don't fit
 * (phones) and stays pinned below the top bar while the page scrolls.
 *
 * Each tab is a real link (`?tab=<key>` on the current path, other query
 * params kept, so filters survive a switch) that REPLACES the history
 * entry and keeps the scroll position. Counts ride on the tab through the
 * `Tab` primitive's `count`; zero shows no count. The page passes only the
 * tabs a visitor would find something on.
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

  const edges = useOverflowEdges(stripRef)

  return (
    <div className="record-tabs">
      <div ref={stripRef} className="record-tabs__scroller">
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
      <TabStripFades start={edges.start} end={edges.end} />
    </div>
  )
}

/* ---------- Body ---------- */

/**
 * The record's full description in place on Overview, cut to about a
 * dozen lines with "Read more" under it when it is longer. The pages
 * render it only when the description has content
 * (`isRenderableDescription`).
 */
export function RecordDescription({
  value,
  did,
}: {
  /** The record's `description` (plain string or Leaflet document). */
  value: unknown
  /** The record's repo DID, for the document's image blobs. */
  did: string
}) {
  return (
    <section className="record-section record-description" aria-label="Description">
      <ClampedText lines={12}>
        <LeafletDocument value={value} did={did} />
      </ClampedText>
    </section>
  )
}

/**
 * "Who's behind it": the account that published the record, told in its
 * own words: the avatar and name, the start of its bio (else of its long
 * description), three lines, and a link to its profile. The byline already
 * names the account, so without any words about it the card isn't drawn.
 */
export function RecordOwnerCard({ did, title = "Who's behind it" }: { did: string; title?: string }) {
  const { info, isLoading } = useAuthorInfo(did)
  const { isOrg, marker, isLoading: markerLoading } = useOrgMarker(did)

  const bio =
    info?.description?.trim() ||
    longDescriptionPlainText(marker?.longDescription)?.split(/\n\s*\n/)[0]?.trim() ||
    null

  if (isLoading || !info || (!bio && markerLoading)) {
    return (
      <FactCard title={title}>
        <div className="flex items-center gap-3" aria-hidden="true">
          <Skeleton variant="circle" width={40} height={40} />
          <Skeleton variant="line" width="9rem" height="0.875rem" />
        </div>
        <Skeleton variant="text" lines={2} width="100%" height={12} aria-hidden />
      </FactCard>
    )
  }
  if (!bio) return null

  const { displayName, unnamed, initials, profileHref } = deriveIdentity(info, did)

  return (
    <FactCard title={title}>
      <Link href={profileHref} className="record-owner">
        <Avatar
          size="row"
          shape={isOrg ? "square" : "circle"}
          src={info.avatarUrl || undefined}
          alt=""
          fallbackInitials={initials}
        />
        <span className="record-owner__name" data-unnamed={unnamed || undefined} dir="auto">
          {displayName}
        </span>
      </Link>
      <p className="record-owner__bio" dir="auto">
        {bio}
      </p>
      <Link href={profileHref} className="record-link">
        View profile
      </Link>
    </FactCard>
  )
}

/**
 * Work scope as tags: sentence case, wrapping, the same in the activity's
 * Details and on a project's activity card.
 */
export function WorkScopeTags({ tags, max }: { tags: readonly string[]; max?: number }) {
  const shown = max ? tags.slice(0, max) : tags
  const rest = tags.length - shown.length
  if (shown.length === 0) return null
  return (
    <ul className="record-tags" aria-label="Work scope">
      {shown.map((t) => (
        <li key={t} className="record-tag">
          {/* Sentence case: "local-first AI" reads "Local-first AI". */}
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </li>
      ))}
      {rest > 0 ? <li className="record-tag record-tag--more">+{rest}</li> : null}
    </ul>
  )
}
