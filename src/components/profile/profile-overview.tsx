"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Check, Copy, X } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ClampedText from "@/components/ui/clamped-text"
import EmptyState from "@/components/ui/empty-state"
import ErrorMessage from "@/components/ui/error-message"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import { FactCard, FactList, type Fact } from "@/components/ui/fact-card"
import { WorkCardList } from "@/components/ui/work-card"
import Map from "@/components/map/map-dynamic"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import { ActivityWorkCard, ProjectWorkCard, sameTitle } from "@/components/feed/work-cards"
import { LocationFactCard, placeFromShape } from "@/components/feed/cert-locations-map"
import { AccountLoadError } from "@/components/feed/cert-detail-parts"
import { KindPendingAvatar, useAccountKind } from "@/components/feed/account-kind"
import { FundingFactCard, useRecordFundingView } from "@/components/funding/record-funding"
import { projectFundingUris } from "@/components/funding/project-fact-card"
import {
  reverseGeocode,
  suggestForwardGeocode,
  type ForwardGeocodeResult,
} from "@/lib/locations/geocode"
import { shortPlaceName, splitLocationName, type LocationShape } from "@/lib/atproto/location"
import {
  projectActivityUris,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { ORG_TYPE_PRESETS } from "@/lib/groups/org-types"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import { deriveIdentity } from "@/lib/utils/identity"
import { parseAtUri, recordUrl } from "@/lib/urls"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import type { ProfileDrafts } from "@/components/profile/profile-inline-edit-types"
import { EndorsementPreviewRow } from "@/components/profile/endorsement-preview-row"
import { uniqueEndorsers } from "@/components/profile/profile-trust-line"
import {
  isKnownEmpty,
  type ProfileSummary,
} from "@/components/profile/use-profile-summary"

/** The account's place, as the Overview shows it. */
export interface OverviewLocation {
  name: string | null
  /** Point or region, when the location record has one. */
  shape: LocationShape | null
  /** The location record is still being read. */
  resolving?: boolean
}

interface ProfileOverviewProps {
  did: string
  /** The account's handle (a fact in the Account card). */
  handle: string | null
  /** Path of the profile page, without the query. */
  basePath: string
  /** What the page loaded about the account (activities, projects,
   *  endorsements), shared with the tab strip. */
  summary: ProfileSummary
  /** The viewer's current identity is this account: empty sections stay,
   *  with the action that fills them. A visitor sees only what there is. */
  viewerIsOwner?: boolean
  /** Inline-edit mode (only sent when the viewer can edit). */
  isEditing?: boolean
  drafts?: ProfileDrafts
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
  /** The profile carries the organization marker. */
  isOrg?: boolean
  /** Whether it is an organization isn't known yet. */
  kindPending?: boolean
  /** The long description, shown here as "About" only when the header's
   *  lead is the bio (otherwise the header already holds it). */
  about?: unknown
  location?: OverviewLocation | null
  /** "Jun 2026", or null when not known (or a Bluesky signup date). */
  joined?: string | null
}

/** Work cards on Overview: two rows of the 2-up grid. */
const PREVIEW = 4
/** Endorsements on Overview. */
const ENDORSEMENTS_PREVIEW = 3
/** Accounts in the "Endorses" (and "Follows") grid. */
const SUPPORTS_PREVIEW = 12
/** Projects whose funding the profile's total takes in. Each is read with
 *  its activities (up to 25 each), so the total stops at the newest ten
 *  projects rather than fan out to hundreds of reads; an account with more
 *  says "across the latest 10 projects". */
const MAX_FUNDED_PROJECTS = 10

/** An activity that its own same-titled project already shows: the
 *  project card stands for both. */
function coveredByProject(a: ActivityRecord, projects: readonly CollectionRecord[]): boolean {
  return projects.some(
    (p) =>
      sameTitle(projectTitle(p.value), a.value.title) &&
      projectActivityUris(p.value.items).includes(a.uri),
  )
}

/**
 * The profile's Overview tab. A reading column with the account's work —
 * About (when the header's lead is the bio), the latest activities and
 * projects as work cards (one is a wide card, more a 2-up grid; an
 * activity its same-titled project already shows is left out), the
 * accounts it endorses ("Endorses N"), and the accounts that endorsed it
 * ("Endorsed by", each once, with their notes) — and, from 1100px, a
 * 320px rail beside it: the funding across its projects, its Location,
 * then the Account facts (handle, Permanent ID; an organization's joining
 * too: a person's is on the header, as are an organization's type and
 * founding). On phones the rail follows the content.
 *
 * A visitor sees only sections with something in them; the account itself
 * sees every section, with the action that fills an empty one. An account
 * with nothing public says so, and shows whom it follows ("Follows N").
 * A section that failed to load says so, with "Try again"; a grid of
 * accounts that couldn't be looked up says it once for all of them.
 */
export default function ProfileOverview({
  did,
  handle,
  basePath,
  summary,
  viewerIsOwner = false,
  isEditing = false,
  drafts,
  onDraftChange,
  isOrg = false,
  kindPending = false,
  about = null,
  location = null,
  joined = null,
}: ProfileOverviewProps) {
  const { activities, recentActivities, projects, received, given, following, counts } =
    summary

  const sortedProjects = useMemo(
    () =>
      [...projects.projects].sort((a, b) =>
        String(a.value.createdAt ?? "") < String(b.value.createdAt ?? "") ? 1 : -1,
      ),
    [projects.projects],
  )
  // The same work isn't shown twice: an activity its same-titled project
  // holds is the project's card.
  const shownActivities = recentActivities.filter(
    (a) => !coveredByProject(a, projects.projects),
  )
  const previewActivities = shownActivities.slice(0, PREVIEW)
  const previewProjects = sortedProjects.slice(0, PREVIEW)
  // Each account that endorsed this one once (its newest award), as the
  // trust line and the tab's count have it.
  const endorsers = useMemo(() => uniqueEndorsers(received.endorsements), [received.endorsements])
  const previewEndorsements = endorsers.slice(0, ENDORSEMENTS_PREVIEW)
  const supported = useMemo(
    () =>
      [...given.endorsements]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((e) => e.subjectDid),
    [given.endorsements],
  )
  const followed = useMemo(
    () =>
      [...(following.records ?? [])]
        .sort((a, b) => (a.value.createdAt < b.value.createdAt ? 1 : -1))
        .map((r) => r.value.subject),
    [following.records],
  )
  const endorserFailures = useSectionFailures()

  const activitiesEmpty = isKnownEmpty(counts.activities)
  const projectsEmpty = isKnownEmpty(counts.projects)
  const endorsementsEmpty =
    isKnownEmpty(counts.endorsements) && isKnownEmpty(counts.endorsementsGiven)
  // A visitor doesn't get an Activities section that only repeated the
  // projects below it.
  const allCovered =
    !activities.error &&
    !counts.activities.isLoading &&
    recentActivities.length > 0 &&
    shownActivities.length === 0 &&
    !activities.hasMore
  const showActivities = viewerIsOwner || (!activitiesEmpty && !allCovered)
  const showProjects = viewerIsOwner || !projectsEmpty
  const showEndorsements = viewerIsOwner || !isKnownEmpty(counts.endorsementsReceived)
  const showSupports = supported.length > 0
  const nothingToShow =
    !viewerIsOwner && !about && activitiesEmpty && projectsEmpty && endorsementsEmpty
  // With nothing public, whom the account follows is what there is to see.
  const showFollows = nothingToShow && followed.length > 0
  // Everything failed at once (the indexer is down): one block, not three.
  const allFailed =
    !!activities.error &&
    recentActivities.length === 0 &&
    !!projects.error &&
    !!received.error &&
    received.endorsements.length === 0
  const retryAll = () => {
    void activities.refetch()
    projects.retry()
    received.refetch()
  }

  return (
    <div className="profile-overview">
      <div className="profile-overview__main">
        {isEditing && isOrg ? (
          <div className="profile-overview__section">
            <OrgTypePickerSection
              selected={drafts?.organizationTypes ?? []}
              other={drafts?.organizationTypeOther ?? ""}
              onDraftChange={onDraftChange}
            />
            <p className="profile-overview__hint">
              Write the long description in the About tab.
            </p>
          </div>
        ) : null}

        {about && !isEditing ? (
          <section className="profile-overview__section" aria-labelledby="profile-overview-about">
            <SectionHeader id="profile-overview-about" title="About" />
            <ClampedText lines={8} className="profile-overview__about">
              <LeafletDocument value={about} did={did} />
            </ClampedText>
          </section>
        ) : null}

        {allFailed ? (
          <ErrorMessage
            title="Couldn't load this account's records"
            message="Something went wrong on our side. Try again in a moment."
            onRetry={retryAll}
          />
        ) : null}

        {showActivities && !allFailed ? (
          <section
            className="profile-overview__section"
            aria-labelledby="profile-overview-activities"
          >
            <SectionHeader
              id="profile-overview-activities"
              title="Activities"
              action={
                shownActivities.length > PREVIEW || activities.hasMore ? (
                  <SeeAllLink href={`${basePath}?tab=activities`} label="All activities" />
                ) : null
              }
            />
            {activities.error && recentActivities.length === 0 ? (
              <ErrorMessage
                title="Couldn't load activities"
                message="Something went wrong on our side. Try again in a moment."
                onRetry={() => void activities.refetch()}
              />
            ) : counts.activities.isLoading ? (
              <CardsSkeleton />
            ) : previewActivities.length === 0 ? (
              <div className="profile-overview__empty">
                <EmptyState
                  variant="inline"
                  title={
                    recentActivities.length > 0
                      ? "Each activity is in its project below."
                      : "No activities yet. Activities you publish or contribute to show here."
                  }
                />
                {recentActivities.length === 0 ? (
                  <Button href="/create" variant="secondary" size="sm">
                    New activity
                  </Button>
                ) : null}
              </div>
            ) : (
              <WorkCardList
                items={previewActivities}
                itemKey={(a) => a.uri}
                render={(a, layout) => (
                  // Contributions live in another account's repo.
                  <ActivityWorkCard
                    record={a}
                    did={activities.dids.get(a.uri) ?? did}
                    layout={layout}
                  />
                )}
              />
            )}
          </section>
        ) : null}

        {showProjects && !allFailed ? (
          <section
            className="profile-overview__section"
            aria-labelledby="profile-overview-projects"
          >
            <SectionHeader
              id="profile-overview-projects"
              title="Projects"
              action={
                projects.projects.length > PREVIEW ? (
                  <SeeAllLink href={`${basePath}?tab=projects`} label="All projects" />
                ) : null
              }
            />
            {projects.error ? (
              <ErrorMessage
                title="Couldn't load projects"
                message="Something went wrong on our side. Try again in a moment."
                onRetry={projects.retry}
              />
            ) : counts.projects.isLoading ? (
              <CardsSkeleton />
            ) : previewProjects.length === 0 ? (
              <div className="profile-overview__empty">
                <EmptyState
                  variant="inline"
                  title="No projects yet. A project groups related activities."
                />
                <Button href="/project/new" variant="secondary" size="sm">
                  New project
                </Button>
              </div>
            ) : (
              <WorkCardList
                items={previewProjects}
                itemKey={(p) => p.uri}
                render={(p, layout) => (
                  // The account's activities give a project without a
                  // banner its picture, as on the project page.
                  <ProjectWorkCard project={p} known={recentActivities} layout={layout} />
                )}
              />
            )}
          </section>
        ) : null}

        {showSupports && !allFailed ? (
          <AccountGridSection
            id="profile-overview-supports"
            // "Endorses", not "Supports": on a funder's profile "Supports
            // 148" reads as money given.
            title="Endorses"
            dids={supported}
            count={supported.length}
            allHref={`${basePath}?tab=endorsements&sub=given`}
          />
        ) : null}

        {showEndorsements && !allFailed ? (
          <section
            className="profile-overview__section"
            aria-labelledby="profile-overview-endorsements"
          >
            {/* "Endorsed by", beside "Endorses N": the accounts that vouch
                for this one. "All endorsements" whenever there is one: the
                tab holds more than this preview (the endorsements given,
                too). */}
            <SectionHeader
              id="profile-overview-endorsements"
              title={
                endorsers.length > 0 ? (
                  <>
                    Endorsed by{" "}
                    <span className="font-normal tabular-nums text-[var(--fg-muted)]">
                      {formatGraphCount(endorsers.length)}
                    </span>
                  </>
                ) : (
                  "Endorsed by"
                )
              }
              action={
                received.endorsements.length > 0 ? (
                  <SeeAllLink href={`${basePath}?tab=endorsements`} label="All endorsements" />
                ) : null
              }
            />
            {received.error && received.endorsements.length === 0 ? (
              <ErrorMessage
                title="Couldn't load endorsements"
                message="Something went wrong on our side. Try again in a moment."
                onRetry={received.refetch}
              />
            ) : counts.endorsements.isLoading ? (
              <EndorsementsSkeleton />
            ) : (
              <>
                {previewEndorsements.length > 0 ? (
                  // The one endorsement row, shared with the Workspace
                  // Overview: the endorser, the date, their note. A row
                  // whose endorser couldn't be looked up leaves itself out;
                  // the line under the list says so once for all of them.
                  <ul className="profile-overview__endorse-list">
                    {previewEndorsements.map((e) => (
                      <EndorsementPreviewRow
                        key={e.uri}
                        endorsement={e}
                        onFailedChange={endorserFailures.report}
                        retryTick={endorserFailures.retryTick}
                      />
                    ))}
                  </ul>
                ) : viewerIsOwner ? (
                  <EmptyState
                    variant="inline"
                    title="No endorsements yet. When another account endorses this one, it shows here."
                  />
                ) : null}
                {endorserFailures.failed.size > 0 ? (
                  <p className="profile-overview__load-error">
                    <AccountLoadError
                      message="Couldn't load these accounts."
                      onRetry={endorserFailures.retryAll}
                    />
                  </p>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {nothingToShow ? (
          // Not "activities, projects or endorsements": a donor's profile
          // has none of those, and the words would cast it as an empty
          // organization.
          <EmptyState
            title="No public records yet."
            description="When this account publishes something, it shows here."
            headingLevel={2}
            className="profile-overview__nothing"
          />
        ) : null}

        {showFollows ? (
          <AccountGridSection
            id="profile-overview-follows"
            title="Follows"
            dids={followed}
            count={following.count}
            more={following.truncated}
            allHref={`${basePath}?tab=followers&sub=following`}
          />
        ) : null}
      </div>

      <aside className="profile-overview__rail" aria-label="Facts about this account">
        {isEditing && isOrg ? (
          <LocationPickerColumn
            name={drafts?.locationName ?? ""}
            lat={drafts?.locationLat ?? null}
            lng={drafts?.locationLng ?? null}
            onDraftChange={onDraftChange}
          />
        ) : kindPending ? (
          <RailSkeleton />
        ) : (
          <>
            <ProfileFundingCard projects={sortedProjects} loading={counts.projects.isLoading} />
            <AccountFacts
              did={did}
              handle={handle}
              location={location}
              // A person's joining is on the header's meta line; an
              // organization's isn't (its type, place and founding are).
              joined={isOrg ? joined : null}
            />
          </>
        )}
      </aside>
    </div>
  )
}

/* ------------------------------ Rail ------------------------------ */

/**
 * The money behind the account's work, where a donor looks: the funding
 * card the record pages use, summed over the account's projects (each
 * with its activities), the newest {@link MAX_FUNDED_PROJECTS} of them.
 * "All gifts" opens the project's Funding tab when there is one project.
 * Renders nothing when there is no funding.
 */
function ProfileFundingCard({
  projects,
  loading,
}: {
  projects: readonly CollectionRecord[]
  loading: boolean
}) {
  const counted = projects.slice(0, MAX_FUNDED_PROJECTS)
  const uris = useMemo(() => {
    const out: string[] = []
    for (const p of projects.slice(0, MAX_FUNDED_PROJECTS)) {
      for (const u of projectFundingUris(p)) if (!out.includes(u)) out.push(u)
    }
    return out
  }, [projects])
  const view = useRecordFundingView(uris, null)
  if (loading || counted.length === 0) return null
  const only = counted.length === 1 ? parseAtUri(counted[0].uri) : null
  const href = only ? `${recordUrl(only.did, "project", only.rkey)}?tab=funding` : null
  const scope =
    projects.length > MAX_FUNDED_PROJECTS
      ? `Across the latest ${MAX_FUNDED_PROJECTS} projects`
      : counted.length > 1
        ? `Across ${counted.length} projects`
        : null
  return <FundingFactCard view={view} href={href} scope={scope} />
}

/**
 * Which of a section's accounts couldn't be looked up, and a "Try again"
 * for all of them: the section says it once ("Couldn't load these
 * accounts.") rather than in every tile or row. Each tile or row reports
 * itself by key and looks up again when `retryTick` changes.
 */
function useSectionFailures() {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [retryTick, setRetryTick] = useState(0)
  const report = useCallback((key: string, isFailed: boolean) => {
    setFailed((prev) => {
      if (prev.has(key) === isFailed) return prev
      const next = new Set(prev)
      if (isFailed) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
  const retryAll = useCallback(() => setRetryTick((n) => n + 1), [])
  return { failed, report, retryTick, retryAll }
}

/**
 * A grid of accounts with a count in its heading ("Endorses 148",
 * "Follows 3"): the newest {@link SUPPORTS_PREVIEW}, each avatar and name
 * to its profile, and "All N" to the full list when there are more. The
 * accounts that couldn't be looked up leave the grid, and one line under
 * it says so, with "Try again".
 */
function AccountGridSection({
  id,
  title,
  dids,
  count,
  more = false,
  allHref,
}: {
  id: string
  title: string
  /** Newest first. */
  dids: readonly string[]
  count: number
  /** More exist than were counted ("10,000+"). */
  more?: boolean
  allHref: string
}) {
  const failures = useSectionFailures()
  const label = formatGraphCount(count, more)
  return (
    <section className="profile-overview__section" aria-labelledby={id}>
      <SectionHeader
        id={id}
        title={
          <>
            {title}{" "}
            <span className="font-normal tabular-nums text-[var(--fg-muted)]">{label}</span>
          </>
        }
        action={
          count > SUPPORTS_PREVIEW ? <SeeAllLink href={allHref} label={`All ${label}`} /> : null
        }
      />
      <ul className="profile-supports">
        {dids.slice(0, SUPPORTS_PREVIEW).map((did) => (
          <AccountTile
            key={did}
            did={did}
            onFailedChange={failures.report}
            retryTick={failures.retryTick}
          />
        ))}
      </ul>
      {failures.failed.size > 0 ? (
        <p className="profile-overview__load-error">
          <AccountLoadError
            message="Couldn't load these accounts."
            onRetry={failures.retryAll}
          />
        </p>
      ) : null}
    </section>
  )
}

/** One account in a grid: its avatar and name, to its profile. While it
 *  isn't known whether the account is a group, the avatar is a neutral
 *  block. One that couldn't be looked up renders nothing and tells the
 *  section (`onFailedChange`), which says so once for all of them. */
function AccountTile({
  did,
  onFailedChange,
  retryTick,
}: {
  did: string
  onFailedChange: (key: string, failed: boolean) => void
  retryTick: number
}) {
  const { info, isLoading, failed, retry } = useAuthorInfo(did)
  const account = useAccountKind(did, { autoRetry: false })

  useEffect(() => {
    onFailedChange(did, failed)
    return () => onFailedChange(did, false)
  }, [onFailedChange, did, failed])

  // The section's "Try again": look up again what failed.
  const latest = useRef({ failed, retry, account })
  useEffect(() => {
    latest.current = { failed, retry, account }
  })
  useEffect(() => {
    if (retryTick === 0) return
    const { failed: f, retry: r, account: a } = latest.current
    if (f) r()
    if (a.failed) a.retry()
  }, [retryTick])

  if (failed) return null
  if (isLoading && !info) {
    return (
      <li className="profile-supports__item" aria-hidden="true">
        <span className="profile-supports__link">
          <Skeleton variant="box" width={40} height={40} />
          <Skeleton variant="line" width="70%" height={14} />
        </span>
      </li>
    )
  }
  const { displayName, unnamed, initials, profileHref, avatarUrl } = deriveIdentity(info, did)
  return (
    <li className="profile-supports__item">
      <Link href={profileHref} className="profile-supports__link">
        {account.kind === "unknown" ? (
          <KindPendingAvatar size={40} animate={account.pending} />
        ) : (
          <Avatar
            size="row"
            shape={account.kind === "org" ? "square" : "circle"}
            src={avatarUrl ?? undefined}
            alt=""
            fallbackInitials={initials}
            seed={did}
          />
        )}
        <span className="profile-supports__name" data-unnamed={unnamed || undefined} dir="auto">
          {displayName}
        </span>
      </Link>
    </li>
  )
}

/**
 * The Account card (and the Location card above it when the place has a
 * point or an area). It holds what the header doesn't: the place when it
 * has no map, when the account joined, its handle and Permanent ID. An
 * organization's type and founding are on the header's meta line, so
 * they aren't repeated here.
 */
function AccountFacts({
  did,
  handle,
  location,
  joined,
}: {
  did: string
  handle: string | null
  location: OverviewLocation | null
  joined: string | null
}) {
  // The place without a leading Plus Code ("W8VJ+RPH, Nosara" → "Nosara").
  const rawName = location?.name?.trim() || null
  const placeName = rawName ? splitLocationName(rawName).name || rawName : null
  const shape = location?.shape ?? null
  const realHandle = handle && !handle.startsWith("did:") ? handle : null

  const facts: Fact[] = []
  // With a map, the place is named under it instead.
  if (placeName && !shape) facts.push({ label: "Location", value: placeName })
  if (joined) facts.push({ label: "Joined", value: joined })
  if (realHandle) {
    facts.push({
      label: "Handle",
      value: <span className="profile-facts__handle">@{realHandle}</span>,
    })
  }
  facts.push({ label: "Permanent ID", value: <PermanentId did={did} /> })

  return (
    <>
      {shape ? (
        // The one Location card of the public pages; the header's meta line
        // names the town, so a caption saying only that is left out.
        <LocationFactCard
          places={[placeFromShape("profile", shape, placeName)]}
          headerPlace={shortPlaceName(placeName)}
        />
      ) : location?.resolving ? (
        <LocationFactCard places={[]} isLoading />
      ) : null}
      <FactCard title="Account" labelledBy="profile-facts-account">
        <FactList facts={facts} />
      </FactCard>
    </>
  )
}

/** The account's DID, whole, with a button that copies it. */
function PermanentId({ did }: { did: string }) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <span className="profile-facts__id">
      <span className="profile-facts__id-value">{did}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Permanent ID copied" : "Copy Permanent ID"}
        onClick={() => void copy(did)}
      >
        {copied ? (
          <Check size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy size={16} strokeWidth={1.75} aria-hidden />
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Permanent ID copied" : ""}
      </span>
    </span>
  )
}

/* ---------------------------- Skeletons ---------------------------- */

/** Loading work cards: two in the grid, a photo frame over the title and
 *  meta line. */
export function CardsSkeleton() {
  return (
    <div className="work-card-list work-card-list--grid" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="profile-overview__card-skeleton">
          <div className="profile-overview__card-skeleton-image">
            <Skeleton variant="box" width="100%" height="100%" />
          </div>
          <div className="flex flex-col gap-2 p-4">
            <Skeleton variant="line" width="80%" height={18} />
            <Skeleton variant="line" width="50%" height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EndorsementsSkeleton() {
  return (
    <div className="profile-overview__endorse-list" aria-hidden>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="profile-overview__endorse-skeleton">
          <Skeleton circle width={32} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton variant="line" width={140} height={14} />
            <Skeleton variant="line" width={80} height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RailSkeleton() {
  return (
    <div className="profile-overview__rail-skeleton" aria-hidden>
      <Skeleton variant="box" height={208} />
      <Skeleton variant="box" height={220} />
    </div>
  )
}

// ---------- Org type picker (edit mode) -----------------------------

interface OrgTypePickerSectionProps {
  selected: string[]
  other: string
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
}

/**
 * Inline editor for `organizationType`. Renders the canonical presets
 * as toggleable chips and an "Other" chip that, when active, reveals a
 * free-text input. Save-side merges the active presets with the trimmed
 * "Other" value into the persisted `string[]`.
 */
function OrgTypePickerSection({
  selected,
  other,
  onDraftChange,
}: OrgTypePickerSectionProps) {
  const otherActive = other.length > 0
  const toggle = (preset: string) => {
    const next = selected.includes(preset)
      ? selected.filter((p) => p !== preset)
      : [...selected, preset]
    onDraftChange?.("organizationTypes", next)
  }
  const toggleOther = () => {
    // Clearing "Other" zeroes the text input; activating it gives the
    // user a focusable empty input (filled below the chip strip).
    onDraftChange?.("organizationTypeOther", otherActive ? "" : " ")
  }
  return (
    <section
      className="profile-overview__types profile-overview__types--editing"
      aria-labelledby="profile-overview-type-heading"
    >
      <SectionHeader id="profile-overview-type-heading" title="Organization type" />
      <ul className="profile-overview__type-chip-list">
        {ORG_TYPE_PRESETS.map((preset) => {
          const active = selected.includes(preset)
          return (
            <li key={preset}>
              <button
                type="button"
                className={
                  "profile-overview__type-chip" +
                  (active ? " profile-overview__type-chip--active" : "")
                }
                aria-pressed={active}
                onClick={() => toggle(preset)}
              >
                {preset}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            className={
              "profile-overview__type-chip" +
              (otherActive ? " profile-overview__type-chip--active" : "")
            }
            aria-pressed={otherActive}
            onClick={toggleOther}
          >
            Other
          </button>
        </li>
      </ul>
      {otherActive ? (
        <input
          type="text"
          className="profile-overview__type-other-input"
          value={other.trimStart()}
          maxLength={128}
          placeholder="Custom organization type"
          aria-label="Custom organization type"
          onChange={(e) =>
            onDraftChange?.("organizationTypeOther", e.target.value)
          }
        />
      ) : null}
    </section>
  )
}

// ---------- Location picker (edit mode) -----------------------------

interface LocationPickerColumnProps {
  name: string
  lat: number | null
  lng: number | null
  onDraftChange?: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
}

function LocationPickerColumn({
  name,
  lat,
  lng,
  onDraftChange,
}: LocationPickerColumnProps) {
  const hasPin = lat !== null && lng !== null
  const pins = hasPin ? [{ lat: lat as number, lng: lng as number }] : []
  const center = hasPin
    ? { lat: lat as number, lng: lng as number }
    : { lat: 20, lng: 0 }
  const zoom = hasPin ? 6 : 1

  // ----- Two-way geocoding bind with autocomplete -----
  // Forward (text → coords): debounce typing, fetch up to 6
  // suggestions from Nominatim, and show them in a dropdown
  // beneath the input. Picking a suggestion sets the name + coords
  // together; just typing without picking only changes the name.
  // Reverse (coords → text): map clicks reverse-geocode and
  // overwrite the name; we mark the change as map-originated so the
  // suggestions effect ignores it.
  const lastSourceRef = useRef<"user" | "map" | null>(null)
  const [busy, setBusy] = useState<"idle" | "forward" | "reverse">("idle")
  const [suggestions, setSuggestions] = useState<ForwardGeocodeResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const blurTimerRef = useRef<number | null>(null)

  // Debounced suggestion fetch on name change. Only fires when the
  // user typed (skips map-originated reverse-geocode results).
  useEffect(() => {
    if (lastSourceRef.current === "map") {
      lastSourceRef.current = null
      // Intentional setState in effect (TECH-814): debounced geocode keyed on the typed name: the map-originated skip branch and the below-2-chars branch clear now-stale suggestions; both bail out when suggestions are already empty
      setSuggestions([])
      return
    }
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    setBusy("forward")
    const t = window.setTimeout(async () => {
      const hits = await suggestForwardGeocode(trimmed, 6, ctrl.signal)
      setBusy("idle")
      setSuggestions(hits)
      setHighlightIndex(hits.length > 0 ? 0 : -1)
    }, 350)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
      setBusy("idle")
    }
  }, [name])

  const pickSuggestion = (hit: ForwardGeocodeResult) => {
    lastSourceRef.current = "map" // the next name change came from us
    onDraftChange?.("locationName", hit.displayName)
    onDraftChange?.("locationLat", hit.lat)
    onDraftChange?.("locationLng", hit.lng)
    setDropdownOpen(false)
    setSuggestions([])
    setHighlightIndex(-1)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setDropdownOpen(true)
        setHighlightIndex(0)
        e.preventDefault()
      }
      return
    }
    if (e.key === "ArrowDown") {
      setHighlightIndex((i) => Math.min(suggestions.length - 1, i + 1))
      e.preventDefault()
    } else if (e.key === "ArrowUp") {
      setHighlightIndex((i) => Math.max(0, i - 1))
      e.preventDefault()
    } else if (e.key === "Enter") {
      const pick = suggestions[highlightIndex] ?? suggestions[0]
      if (pick) {
        e.preventDefault()
        pickSuggestion(pick)
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false)
      e.preventDefault()
    }
  }

  const handleMapClick = async (latlng: { lat: number; lng: number }) => {
    onDraftChange?.("locationLat", latlng.lat)
    onDraftChange?.("locationLng", latlng.lng)
    lastSourceRef.current = "map"
    setBusy("reverse")
    setDropdownOpen(false)
    const hit = await reverseGeocode(latlng.lat, latlng.lng)
    setBusy("idle")
    if (hit?.displayName) {
      onDraftChange?.("locationName", hit.displayName)
    }
  }

  return (
    <aside
      className="profile-overview__location profile-overview__location--editing"
      aria-labelledby="profile-overview-location-heading"
    >
      <SectionHeader id="profile-overview-location-heading" title="Location" />
      <div className="profile-overview__location-combobox">
        <input
          type="text"
          className="profile-overview__location-input"
          value={name}
          maxLength={128}
          placeholder="Type a city or address…"
          aria-label="Location name"
          role="combobox"
          aria-expanded={dropdownOpen && suggestions.length > 0}
          aria-autocomplete="list"
          aria-controls="profile-overview-location-suggestions"
          aria-activedescendant={
            highlightIndex >= 0
              ? `profile-overview-location-suggestion-${highlightIndex}`
              : undefined
          }
          onChange={(e) => {
            lastSourceRef.current = "user"
            setDropdownOpen(true)
            onDraftChange?.("locationName", e.target.value)
          }}
          onFocus={() => {
            if (blurTimerRef.current) {
              window.clearTimeout(blurTimerRef.current)
              blurTimerRef.current = null
            }
            if (suggestions.length > 0) setDropdownOpen(true)
          }}
          onBlur={() => {
            // Defer close so a mousedown on a suggestion can still
            // register before the dropdown unmounts.
            blurTimerRef.current = window.setTimeout(() => {
              setDropdownOpen(false)
            }, 150)
          }}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
        />
        {dropdownOpen && suggestions.length > 0 ? (
          <ul
            id="profile-overview-location-suggestions"
            role="listbox"
            className="profile-overview__location-suggestions"
          >
            {suggestions.map((hit, i) => {
              const isActive = i === highlightIndex
              const [primary, ...rest] = hit.displayName.split(", ")
              const secondary = rest.join(", ")
              return (
                <li
                  key={`${hit.lat}-${hit.lng}-${i}`}
                  id={`profile-overview-location-suggestion-${i}`}
                  role="option"
                  aria-selected={isActive}
                  className={
                    isActive
                      ? "profile-overview__location-suggestion profile-overview__location-suggestion--active"
                      : "profile-overview__location-suggestion"
                  }
                  onMouseEnter={() => setHighlightIndex(i)}
                  // mousedown (not click) fires before the input's
                  // blur; otherwise the dropdown would already be
                  // closed by the time the click event arrived.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickSuggestion(hit)
                  }}
                >
                  <span className="profile-overview__location-suggestion-primary">
                    {primary}
                  </span>
                  {secondary ? (
                    <span className="profile-overview__location-suggestion-secondary">
                      {secondary}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
      <div className="profile-overview__location-map">
        <Map
          pins={pins}
          center={center}
          zoom={zoom}
          height={220}
          onMapClick={handleMapClick}
          compactAttribution
        />
      </div>
      <div className="profile-overview__location-picker-row">
        <p className="profile-overview__location-hint">
          {busy === "forward"
            ? "Searching…"
            : busy === "reverse"
              ? "Resolving address…"
              : hasPin
                ? "Click the map to move the pin, or pick a different result above."
                : "Pick a suggestion or click the map to place a pin."}
        </p>
        {hasPin ? (
          <button
            type="button"
            className="profile-overview__location-clear"
            onClick={() => {
              lastSourceRef.current = "user"
              onDraftChange?.("locationLat", null)
              onDraftChange?.("locationLng", null)
            }}
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
            Clear pin
          </button>
        ) : null}
      </div>
      <p className="profile-overview__location-attribution">
        © <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        contributors
      </p>
    </aside>
  )
}

