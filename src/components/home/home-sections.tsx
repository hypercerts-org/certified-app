"use client"

import { useId, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, FolderGit2, Plus } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Badge from "@/components/ui/badge"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import RowThumb from "@/components/ui/row-thumb"
import Skeleton from "@/components/ui/skeleton"
import SsoAppLink from "@/app/apps/sso-app-link"
import { EndorsementPreviewRow } from "@/components/profile/endorsement-preview-row"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useOrg } from "@/lib/groups/org-context"
import { CONNECTED_APPS } from "@/lib/constants/apps"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { activityDetailHref } from "@/lib/atproto/activity-uri"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { projectImage, projectTitle } from "@/lib/atproto/collection"
import type { WorkspaceCounts } from "@/lib/atproto/workspace"
import { recordUrl } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

const LATEST_RECORDS = 4
const LATEST_ENDORSEMENTS = 3
const GROUP_PREVIEW = 5

// ---------------------------- Shared shell ----------------------------------

/**
 * One home section: a serif heading, an optional one-line description and
 * an optional "See all"-style link on the right. Every section is an `<h2>`
 * under the chrome's `<h1>` (DESIGN.md §3.6); the account card's name is the
 * other `<h2>`.
 */
function HomeBlock({
  title,
  description,
  action,
  className = "",
  tour,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  tour?: string
  children: React.ReactNode
}) {
  const titleId = useId()
  return (
    <section
      className={`home-block ${className}`}
      aria-labelledby={titleId}
      data-tour={tour}
    >
      <div className="home-block__head">
        <div className="home-block__heading">
          <h2 id={titleId} className="home-block__title font-headline text-h4">
            {title}
          </h2>
          {description ? <p className="home-block__desc">{description}</p> : null}
        </div>
        {action ? <div className="home-block__action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function SeeAll({ href, label = "See all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="home-block__see-all">
      {label} <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
    </Link>
  )
}

/** A count tile that links to the full list on the profile. */
function CountTile({
  label,
  value,
  isLoading,
  href,
}: {
  label: string
  value: number | null
  isLoading: boolean
  href: string
}) {
  return (
    <li>
      <Link href={href} className="home-count">
        <span className="home-count__value">
          {isLoading && value === null ? (
            <Skeleton variant="line" width={28} height={22} aria-hidden />
          ) : (
            (value ?? "–")
          )}
        </span>
        <span className="home-count__label">{label}</span>
      </Link>
    </li>
  )
}

// ------------------------------- Records ------------------------------------

type LatestRecord = {
  uri: string
  kind: "Activity" | "Project"
  title: string
  createdAt: string
  href: string
  imageUrl: string | null
}

export function HomeRecords({
  did,
  profileBase,
  counts,
  countsLoading,
  canCreate,
}: {
  did: string
  profileBase: string
  counts: WorkspaceCounts
  countsLoading: boolean
  canCreate: boolean
}) {
  const { projects, isLoading: projectsLoading } = useUserProjects(did)
  const { created, isLoading: activitiesLoading } = useUserIndexerActivities(did)

  // Newest first across both kinds, so the list reads as "what was added
  // to this account lately" rather than two separate lists.
  const latest = useMemo<LatestRecord[]>(() => {
    const rows: LatestRecord[] = []
    for (const a of created) {
      const parsed = parseAtUri(a.uri)
      if (!parsed) continue
      rows.push({
        uri: a.uri,
        kind: "Activity",
        title: a.value.title || "Untitled activity",
        createdAt: a.value.createdAt ?? "",
        href: activityDetailHref(parsed.did, parsed.rkey),
        imageUrl: a.value.image ? resolveActivityImageUrl(a.value.image, parsed.did) : null,
      })
    }
    for (const p of projects) {
      const parsed = parseAtUri(p.uri)
      if (!parsed) continue
      const raw = projectImage(p.value, "thumb")
      rows.push({
        uri: p.uri,
        kind: "Project",
        title: projectTitle(p.value),
        createdAt: p.value.createdAt ?? "",
        href: recordUrl(parsed.did, "project", parsed.rkey),
        imageUrl: raw ? resolveActivityImageUrl(raw, parsed.did) : null,
      })
    }
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    return rows.slice(0, LATEST_RECORDS)
  }, [created, projects])

  const listsLoading = projectsLoading || activitiesLoading
  // "Nothing published" only when the lists AND the counts agree: the list
  // hooks swallow fetch errors, so an empty list next to non-zero counts
  // means a failed fetch, not an empty account.
  const isEmpty =
    !listsLoading &&
    latest.length === 0 &&
    !countsLoading &&
    !counts.certs &&
    !counts.projects &&
    !counts.lists

  return (
    <HomeBlock
      title="Records"
      description="What this account has published, here and in other apps."
      tour="home-records"
      action={
        canCreate ? (
          <Button href="/create" variant="secondary" size="sm">
            <Plus size={14} aria-hidden />
            New activity
          </Button>
        ) : null
      }
    >
      <ul className="home-counts" aria-label="Records by kind">
        <CountTile
          label="Activities"
          value={counts.certs}
          isLoading={countsLoading}
          href={`${profileBase}?tab=activities`}
        />
        <CountTile
          label="Projects"
          value={counts.projects}
          isLoading={countsLoading}
          href={`${profileBase}?tab=projects`}
        />
        <CountTile
          label="Lists"
          value={counts.lists}
          isLoading={countsLoading}
          href={`${profileBase}?tab=lists`}
        />
      </ul>

      {/* Wait for both lists so the newest-first rows don't reshuffle
          when the second fetch lands. */}
      {listsLoading ? (
        <div className="home-block__loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          variant="compact"
          title="Nothing published yet."
          description={
            canCreate
              ? "Activities and projects you publish, here or in another app, are kept on this account."
              : "Activities and projects published for this account will show here."
          }
          className="home-block__empty"
        />
      ) : latest.length > 0 ? (
        <>
          <h3 className="home-block__subhead">Latest</h3>
          <ul className="home-records">
            {latest.map((r) => (
              <li key={r.uri}>
                <Link href={r.href} className="home-record">
                  <RowThumb
                    className="home-record__thumb"
                    src={r.imageUrl}
                    icon={
                      r.kind === "Project" ? (
                        <FolderGit2 size={16} strokeWidth={1.5} aria-hidden />
                      ) : (
                        <CertIcon size={16} strokeWidth={1.5} aria-hidden />
                      )
                    }
                  />
                  <span className="home-record__text">
                    <span className="home-record__title" dir="auto">{r.title}</span>
                    <span className="home-record__meta">
                      {r.kind}
                      {r.createdAt ? (
                        <>
                          <span aria-hidden> · </span>
                          {formatShortDate(r.createdAt)}
                        </>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </HomeBlock>
  )
}

// ---------------------------- From others -----------------------------------

export function HomeReceived({
  did,
  profileBase,
  counts,
  countsLoading,
}: {
  did: string
  profileBase: string
  counts: WorkspaceCounts
  countsLoading: boolean
}) {
  // Hidden (rejected) endorsements are left out, so the count matches the
  // list the profile shows.
  const { endorsements, isLoading } = useReceivedEndorsements(did)
  const preview = endorsements.slice(0, LATEST_ENDORSEMENTS)
  const endorsementsHref = `${profileBase}?tab=endorsements&sub=received`

  return (
    <HomeBlock
      title="From others"
      description="Endorsements and follows that other accounts have given this one."
      tour="home-received"
      action={endorsements.length > LATEST_ENDORSEMENTS ? <SeeAll href={endorsementsHref} /> : null}
    >
      <ul className="home-counts" aria-label="Received, by kind">
        <CountTile
          label="Endorsements"
          value={isLoading && endorsements.length === 0 ? null : endorsements.length}
          isLoading={isLoading}
          href={endorsementsHref}
        />
        <CountTile
          label="Followers"
          value={counts.followers}
          isLoading={countsLoading}
          href={`${profileBase}?tab=followers`}
        />
      </ul>

      {isLoading && preview.length === 0 ? (
        <div className="home-block__loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : preview.length === 0 ? (
        <p className="home-block__note">
          No endorsements yet. When another account endorses this one, it
          shows here and on the profile.
        </p>
      ) : (
        <>
          <h3 className="home-block__subhead">Latest endorsements</h3>
          {/* Reuses the profile Overview's endorsement rows and styles. */}
          <ul className="profile-overview__endorse-list">
            {preview.map((e) => (
              <EndorsementPreviewRow key={e.uri} endorsement={e} />
            ))}
          </ul>
        </>
      )}
    </HomeBlock>
  )
}

// --------------------------------- Apps -------------------------------------

export function HomeApps() {
  return (
    <HomeBlock
      title="Apps"
      description="Sign in to each of these with your Certified account."
      tour="home-apps"
      action={<SeeAll href="/apps" label="All apps" />}
    >
      <ul className="home-apps">
        {CONNECTED_APPS.map((app) => (
          <li key={app.name}>
            <SsoAppLink
              url={app.url}
              ssoHandleUrl={"ssoHandleUrl" in app ? app.ssoHandleUrl : undefined}
              className="home-app"
            >
              <Image
                src={app.logo}
                alt=""
                width={40}
                height={40}
                className="home-app__logo"
              />
              <span className="home-app__text">
                <span className="home-app__name">{app.name}</span>
                <span className="home-app__desc">{app.desc}</span>
              </span>
              <ArrowUpRight
                size={16}
                strokeWidth={1.75}
                aria-hidden
                className="home-app__arrow"
              />
            </SsoAppLink>
          </li>
        ))}
      </ul>
    </HomeBlock>
  )
}

// -------------------------------- Groups ------------------------------------

/** The groups the signed-in person belongs to. Personal account only:
 *  while acting as a group the list would be the person's, not the group's. */
export function HomeGroups({ profileBase }: { profileBase: string }) {
  const { groups, isLoading } = useOrg()
  if (isLoading || groups.length === 0) return null
  const preview = groups.slice(0, GROUP_PREVIEW)
  return (
    <HomeBlock
      title="Your groups"
      description="Switch to a group from the account menu to act for it."
      action={groups.length > GROUP_PREVIEW ? <SeeAll href={`${profileBase}?tab=groups`} /> : null}
    >
      <ul className="home-groups">
        {preview.map((g) => {
          const label = g.displayName || g.handle || "Group"
          return (
            <li key={g.groupDid}>
              <Link
                href={`/groups/${encodeURIComponent(g.groupDid)}`}
                className="home-group"
              >
                <Avatar
                  size="sm"
                  src={g.avatarUrl}
                  alt=""
                  fallbackInitials={getInitials(g.displayName ?? g.handle, g.handle)}
                />
                <span className="home-group__name" dir="auto">{label}</span>
                <Badge variant="role">{g.role}</Badge>
              </Link>
            </li>
          )
        })}
      </ul>
    </HomeBlock>
  )
}

// --------------------------------- Feed -------------------------------------

/** Wraps the follow-graph feed so it sits on the page as one section among
 *  the others, under its own heading. */
export function HomeFeedBlock({ children }: { children: React.ReactNode }) {
  return (
    <HomeBlock
      title="From accounts you follow"
      description="New activities, projects and endorsements from accounts and groups you follow."
      className="home-block--feed"
      tour="home-feed"
    >
      {children}
    </HomeBlock>
  )
}
