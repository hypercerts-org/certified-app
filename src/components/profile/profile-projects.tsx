"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FolderGit2, Plus, SearchX } from "lucide-react"
import { recordUrl } from "@/lib/urls"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import RowThumb from "@/components/ui/row-thumb"
import SectionHeader from "@/components/ui/section-header"
import OwnerByline from "@/components/ui/owner-byline"
import {
  PANEL_SEARCH_MIN,
  PanelCount,
  PanelTools,
  ProfileRowsSkeleton,
  type SortOption,
} from "@/components/profile/profile-panel"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useManagedProjects } from "@/hooks/use-managed-projects"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { formatRelativeDate } from "@/lib/utils/format-date"
import {
  asString,
  projectImage,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import type { OwnerTag } from "@/lib/atproto/owner-tag"

interface ProfileProjectsProps {
  did: string
  /** The viewer's current identity is this account: adds "New project". */
  viewerIsOwner?: boolean
  /** True only on the viewer's OWN personal profile (not acting-as a
   *  group). When set, the tab aggregates projects owned by the groups
   *  the viewer owns/admins, each tagged "by {group}". */
  aggregateOwned?: boolean
}

type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Title A to Z" },
  { key: "alpha-desc", label: "Title Z to A" },
]

/**
 * Projects tab on a profile, as rows like the Overview: a thumbnail, the
 * title, its description, how many activities it holds and when it was
 * published. A row opens the project page, which lists its activities.
 */
export default function ProfileProjects(props: ProfileProjectsProps) {
  // The project hooks expose no refetch, so "Try again" remounts the tab
  // body (a fresh mount re-runs both loads).
  const [attempt, setAttempt] = useState(0)
  return (
    <ProfileProjectsBody
      key={attempt}
      {...props}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  )
}

function ProfileProjectsBody({
  did,
  viewerIsOwner,
  aggregateOwned = false,
  onRetry,
}: ProfileProjectsProps & { onRetry: () => void }) {
  // On the viewer's own personal profile, aggregate projects owned by the
  // groups they own/admin (each tagged "by {group}"); elsewhere show just
  // this profile's own projects. Both hooks are always called; the inactive
  // one is disabled so it does no fetch.
  const single = useUserProjects(aggregateOwned ? null : did)
  const managed = useManagedProjects({ enabled: aggregateOwned })

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")

  const projects = aggregateOwned
    ? managed.items.map((it) => it.record)
    : single.projects
  const ownerByUri = aggregateOwned
    ? new Map(managed.items.map((it) => [it.record.uri, it.owner]))
    : null
  const isLoading = aggregateOwned ? managed.isLoading : single.isLoading
  const error = aggregateOwned ? managed.error : single.error
  // The aggregated set (personal + every managed group) can exceed one
  // page, so the own-profile view paginates. The single-DID path is a
  // single capped fetch, so it never offers "Load more".
  const hasMore = aggregateOwned && managed.hasMore
  const isLoadingMore = aggregateOwned && managed.isLoadingMore

  const visible = useMemo(
    () => filterAndSort(projects, query, sort),
    [projects, query, sort],
  )
  const showTools = projects.length > PANEL_SEARCH_MIN || query.trim() !== ""
  const loading = isLoading && projects.length === 0

  const body = loading ? (
    <ProfileRowsSkeleton rows={3} />
  ) : error ? (
    <EmptyState
      icon={FolderGit2}
      title="Couldn't load projects"
      description="Something went wrong on our side. Try again in a moment."
    >
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </EmptyState>
  ) : projects.length === 0 ? (
    <EmptyState
      icon={FolderGit2}
      title="No projects yet"
      description={
        viewerIsOwner
          ? "A project groups related activities. Projects you create show here."
          : "Projects this account creates show here."
      }
    >
      {viewerIsOwner ? (
        <Button href="/project/new" variant="secondary" size="sm">
          New project
        </Button>
      ) : null}
    </EmptyState>
  ) : visible.length === 0 ? (
    <EmptyState
      icon={SearchX}
      title="Nothing matches"
      description={`No projects match "${query.trim()}".`}
    >
      <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
        Clear search
      </Button>
    </EmptyState>
  ) : (
    <>
      <ul className="profile-rows">
        {visible.map((p) => (
          <ProjectRow key={p.uri} project={p} owner={ownerByUri?.get(p.uri)} />
        ))}
      </ul>
      {hasMore ? (
        <div className="profile-panel__more">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => managed.loadMore()}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </>
  )

  return (
    <section className="profile-panel" aria-labelledby="profile-projects-heading">
      <SectionHeader
        id="profile-projects-heading"
        title={
          <>
            Projects <PanelCount n={loading || error ? null : projects.length} />
          </>
        }
        action={
          // The empty state carries "New project" when there are none.
          viewerIsOwner && (loading || !!error || projects.length > 0) ? (
            <Button href="/project/new" variant="secondary" size="sm">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New project
            </Button>
          ) : null
        }
      />
      {showTools ? (
        <PanelTools
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search projects"
          sort={sort}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSort}
          sortLabel="Sort projects"
        />
      ) : null}
      {body}
    </section>
  )
}

/** One project as a row; opens the project page. */
function ProjectRow({ project, owner }: { project: CollectionRecord; owner?: OwnerTag }) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const projectDid = parsed?.did ?? ""
  const href = parsed ? recordUrl(parsed.did, "project", parsed.rkey) : null

  const title = projectTitle(value)
  const shortDesc = asString(value.shortDescription)
  const createdAt = asString(value.createdAt)
  const rawImage = projectImage(value, "thumb")
  const imageUrl =
    rawImage && projectDid ? resolveActivityImageUrl(rawImage, projectDid) : null
  const activities = countActivityItems(value.items)

  const body = (
    <>
      <RowThumb
        src={imageUrl}
        icon={<FolderGit2 size={20} strokeWidth={1.25} />}
        className="profile-row__thumb"
      />
      <span className="profile-row__text">
        <span className="profile-row__title" dir="auto">
          {title}
        </span>
        {owner && owner.kind === "group" && owner.group ? (
          <OwnerByline group={owner.group} role={owner.role} />
        ) : null}
        {shortDesc ? (
          <span className="profile-row__desc" dir="auto">
            {shortDesc}
          </span>
        ) : null}
        <span className="profile-row__meta">
          {activities === 1 ? "1 activity" : `${activities} activities`}
        </span>
      </span>
      {createdAt ? (
        <time className="profile-row__date" dateTime={createdAt}>
          {formatRelativeDate(createdAt)}
        </time>
      ) : null}
    </>
  )

  return (
    <li>
      {href ? (
        <Link href={href} className="profile-row profile-row--link">
          {body}
        </Link>
      ) : (
        <div className="profile-row">{body}</div>
      )}
    </li>
  )
}

function filterAndSort(
  projects: CollectionRecord[],
  query: string,
  sort: SortKey,
): CollectionRecord[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? projects.filter((p) => {
        const t = projectTitle(p.value).toLowerCase()
        const d = (asString(p.value.shortDescription) ?? "").toLowerCase()
        return t.includes(q) || d.includes(q)
      })
    : projects

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareDate(asString(b.value.createdAt) ?? "", asString(a.value.createdAt) ?? "")
      case "created-asc":
        return compareDate(asString(a.value.createdAt) ?? "", asString(b.value.createdAt) ?? "")
      case "alpha-asc":
        return projectTitle(a.value).localeCompare(projectTitle(b.value))
      case "alpha-desc":
        return projectTitle(b.value).localeCompare(projectTitle(a.value))
    }
  })
  return sorted
}

function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** How many of a project's items are activities (no fetch needed). */
function countActivityItems(items: unknown): number {
  if (!Array.isArray(items)) return 0
  let n = 0
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const id = (it as Record<string, unknown>).itemIdentifier
    if (!id || typeof id !== "object") continue
    const uri = (id as Record<string, unknown>).uri
    if (typeof uri !== "string") continue
    const parsed = parseAtUri(uri)
    if (parsed?.collection === "org.hypercerts.claim.activity") n += 1
  }
  return n
}
