"use client"

import { useId, useMemo } from "react"
import Link from "next/link"
import { FolderGit2, Plus } from "lucide-react"
import AppTile from "@/components/apps/app-tile"
import Avatar from "@/components/ui/avatar"
import Badge from "@/components/ui/badge"
import Button from "@/components/ui/button"
import CertIcon from "@/components/ui/cert-icon"
import EmptyState from "@/components/ui/empty-state"
import RowThumb from "@/components/ui/row-thumb"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import StatRow from "@/components/ui/stat-row"
import { EndorsementPreviewRow } from "@/components/profile/endorsement-preview-row"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useOrg } from "@/lib/groups/org-context"
import type { Group } from "@/lib/groups/types"
import { CONNECTED_APPS } from "@/lib/constants/apps"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { activityDetailHref, parseAtUri } from "@/lib/atproto/activity-uri"
import { projectImage, projectTitle } from "@/lib/atproto/collection"
import type { WorkspaceCounts } from "@/lib/atproto/workspace"
import { recordUrl } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

const LATEST_RECORDS = 4
const LATEST_ENDORSEMENTS = 3
const GROUP_PREVIEW = 5
/** Apps shown on home; the rest are one click away under "All apps". */
const HOME_APPS = CONNECTED_APPS.slice(0, 4)

// ---------------------------- Shared shell ----------------------------------

/**
 * One home section: a `SectionHeader` (title, one-line description, an
 * optional action on the right) with the content 12px below. Every
 * section is an `<h2>` under the page header's `<h1>` (DESIGN.md §3.6).
 */
function HomeSection({
  title,
  description,
  action,
  tour,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  tour?: string
  children: React.ReactNode
}) {
  const titleId = useId()
  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-labelledby={titleId}
      data-tour={tour}
    >
      <SectionHeader id={titleId} title={title} description={description} action={action} />
      {children}
    </section>
  )
}

/** A quiet label over a short list ("Latest"); an `<h3>` in the section. */
function ListLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 text-ui font-medium text-[var(--fg-muted)]">{children}</h3>
}

/** Placeholder rows shaped like the real ones: a 40px thumb (or a 32px
 *  avatar) and two lines, between the same hairlines. */
function RowsSkeleton({
  count,
  thumb,
}: {
  count: number
  thumb: "record" | "person" | "group"
}) {
  return (
    <ul className="home-rows" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="home-row">
            {thumb === "record" ? (
              <Skeleton variant="box" width={40} height={40} />
            ) : thumb === "group" ? (
              <Skeleton variant="box" width={32} height={32} />
            ) : (
              <Skeleton variant="circle" width={32} />
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton variant="line" width={`${60 - i * 12}%`} height={14} />
              <Skeleton variant="line" width="25%" height={12} />
            </span>
          </div>
        </li>
      ))}
    </ul>
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

/** Where the counts and "All records" lead. The personal account manages
 *  its records on /records; a group's records live on its profile (Records
 *  only explains how to switch back while acting as a group). */
function recordsHrefs(isGroup: boolean, profileBase: string) {
  return isGroup
    ? {
        all: `${profileBase}?tab=activities`,
        activities: `${profileBase}?tab=activities`,
        projects: `${profileBase}?tab=projects`,
        lists: `${profileBase}?tab=lists`,
        endorsements: `${profileBase}?tab=endorsements&sub=received`,
        followers: `${profileBase}?tab=followers`,
      }
    : {
        all: "/records",
        // Projects and activities share one view (folders) on /records.
        activities: "/records?kind=activities",
        projects: "/records?kind=activities",
        lists: "/records?kind=lists",
        endorsements: "/records?kind=endorsements",
        followers: "/records?kind=followers",
      }
}

export function HomeRecords({
  did,
  isGroup,
  profileBase,
  counts,
  countsLoading,
  canCreate,
}: {
  did: string
  isGroup: boolean
  profileBase: string
  counts: WorkspaceCounts
  countsLoading: boolean
  canCreate: boolean
}) {
  const { projects, isLoading: projectsLoading } = useUserProjects(did)
  const { created, isLoading: activitiesLoading } = useUserIndexerActivities(did)
  const hrefs = recordsHrefs(isGroup, profileBase)

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

  // Wait for both lists so the newest-first rows don't reshuffle when the
  // second fetch lands.
  const listsLoading = projectsLoading || activitiesLoading
  const hasCount = (n: number | null) => (n ?? 0) > 0
  const isEmpty =
    !listsLoading &&
    !countsLoading &&
    latest.length === 0 &&
    !hasCount(counts.certs) &&
    !hasCount(counts.projects) &&
    !hasCount(counts.lists)

  return (
    <HomeSection
      title="Your records"
      description="What you have published, here or in other apps."
      tour="home-records"
      action={isEmpty ? null : <SeeAllLink href={hrefs.all} label="All records" />}
    >
      {isEmpty ? (
        <EmptyState
          icon={CertIcon}
          title="No records yet"
          description="Activities and projects you publish, here or in other apps, show up here."
        >
          {canCreate ? (
            <Button href="/create" variant="primary" size="md">
              <Plus size={16} aria-hidden />
              New activity
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <StatRow
            aria-label="Records by kind"
            items={[
              {
                label: "Activities",
                value: counts.certs,
                loading: countsLoading && counts.certs === null,
                href: hrefs.activities,
              },
              {
                label: "Projects",
                value: counts.projects,
                loading: countsLoading && counts.projects === null,
                href: hrefs.projects,
              },
              {
                label: "Lists",
                value: counts.lists,
                loading: countsLoading && counts.lists === null,
                href: hrefs.lists,
              },
            ]}
          />

          {listsLoading ? (
            <RowsSkeleton count={3} thumb="record" />
          ) : latest.length > 0 ? (
            <div className="flex flex-col gap-2">
              <ListLabel>Latest</ListLabel>
              <ul className="home-rows">
                {latest.map((r) => (
                  <li key={r.uri}>
                    <Link href={r.href} className="home-row">
                      <RowThumb
                        className="home-row__thumb"
                        src={r.imageUrl}
                        icon={
                          r.kind === "Project" ? (
                            <FolderGit2 size={16} strokeWidth={1.75} aria-hidden />
                          ) : (
                            <CertIcon size={16} strokeWidth={1.75} aria-hidden />
                          )
                        }
                      />
                      <span className="home-row__text">
                        <span className="home-row__title" dir="auto">
                          {r.title}
                        </span>
                        <span className="home-row__meta">
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
            </div>
          ) : null}
        </div>
      )}
    </HomeSection>
  )
}

// ---------------------------- From others -----------------------------------

export function HomeReceived({
  did,
  isGroup,
  profileBase,
  counts,
  countsLoading,
}: {
  did: string
  isGroup: boolean
  profileBase: string
  counts: WorkspaceCounts
  countsLoading: boolean
}) {
  // Hidden (rejected) endorsements are left out, so the count matches the
  // list the profile shows.
  const { endorsements, isLoading } = useReceivedEndorsements(did)
  const preview = endorsements.slice(0, LATEST_ENDORSEMENTS)
  const hrefs = recordsHrefs(isGroup, profileBase)
  const endorsementsLoading = isLoading && endorsements.length === 0

  return (
    <HomeSection
      title="From others"
      description="Endorsements and follows that others have given you."
      tour="home-received"
      action={
        preview.length > 0 ? (
          <SeeAllLink href={hrefs.endorsements} label="All endorsements" />
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        <StatRow
          aria-label="Received, by kind"
          items={[
            {
              label: "Endorsements",
              value: endorsementsLoading ? null : endorsements.length,
              loading: endorsementsLoading,
              href: hrefs.endorsements,
            },
            {
              label: "Followers",
              value: counts.followers,
              loading: countsLoading && counts.followers === null,
              href: hrefs.followers,
            },
          ]}
        />

        {/* No endorsements yet: the count says it; no extra line. */}
        {endorsementsLoading ? (
          <RowsSkeleton count={2} thumb="person" />
        ) : preview.length > 0 ? (
          <div className="flex flex-col gap-2">
            <ListLabel>Latest endorsements</ListLabel>
            {/* Reuses the profile Overview's endorsement rows and styles. */}
            <ul className="profile-overview__endorse-list">
              {preview.map((e) => (
                <EndorsementPreviewRow key={e.uri} endorsement={e} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </HomeSection>
  )
}

// --------------------------------- Apps -------------------------------------

export function HomeApps() {
  return (
    <HomeSection
      title="Apps"
      description="Sign in to each of these with your Certified account."
      tour="home-apps"
      action={<SeeAllLink href="/apps" label="All apps" />}
    >
      {/* One per row on a phone, two across from 800px. */}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
        {HOME_APPS.map((app) => (
          <li key={app.name} className="flex">
            <AppTile app={app} size="sm" />
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}

// -------------------------------- Groups ------------------------------------

/**
 * A group's row label: its display name, else its @handle, else "Group".
 * A blank or whitespace-only display name, or a "handle" that is really
 * the DID (unresolved), never leaves the row without a name.
 */
export function groupRowLabel(group: Pick<Group, "groupDid" | "handle" | "displayName">): {
  name: string
  handle: string | null
} {
  const raw = group.handle?.trim() ?? ""
  const handle =
    raw && raw !== group.groupDid && !raw.startsWith("did:") ? `@${raw.replace(/^@/, "")}` : null
  const displayName = group.displayName?.trim() || null
  if (displayName) return { name: displayName, handle }
  return { name: handle ?? "Group", handle: null }
}

/**
 * The groups the signed-in person belongs to, each with their role, and
 * "New group" in the corner. Personal account only: while acting as a
 * group the list would be the person's, not the group's.
 */
export function HomeGroups({ profileBase }: { profileBase: string }) {
  const { groups, isLoading } = useOrg()
  const preview = groups.slice(0, GROUP_PREVIEW)

  return (
    <HomeSection
      title="Your groups"
      tour="home-groups"
      action={
        <Button href="/groups/create" variant="ghost" size="sm">
          <Plus size={14} aria-hidden />
          New group
        </Button>
      }
    >
      {isLoading && groups.length === 0 ? (
        <RowsSkeleton count={2} thumb="group" />
      ) : groups.length === 0 ? (
        <EmptyState variant="inline" title="You're not in any groups yet." />
      ) : (
        <ul className="home-rows">
          {preview.map((g) => {
            const { name, handle } = groupRowLabel(g)
            return (
              <li key={g.groupDid}>
                <Link
                  href={`/groups/${encodeURIComponent(g.groupDid)}`}
                  className="home-row"
                >
                  <Avatar
                    size="sm"
                    shape="square"
                    src={g.avatarUrl}
                    alt=""
                    seed={g.groupDid}
                    fallbackInitials={getInitials(g.displayName, g.handle)}
                  />
                  <span className="home-row__text">
                    <span className="home-row__title" dir="auto">
                      {name}
                    </span>
                    {handle ? <span className="home-row__meta">{handle}</span> : null}
                  </span>
                  <Badge variant="role">{g.role}</Badge>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {groups.length > GROUP_PREVIEW ? (
        <div>
          <SeeAllLink href={`${profileBase}?tab=groups`} label={`All ${groups.length} groups`} />
        </div>
      ) : null}
    </HomeSection>
  )
}
