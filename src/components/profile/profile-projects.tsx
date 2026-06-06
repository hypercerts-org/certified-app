"use client"

import { useMemo, useState } from "react"
import { recordUrl } from "@/lib/urls"
import Link from "next/link"
import { ArrowRight, ArrowUpDown, Calendar, FolderGit2, Plus, Search } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useManagedProjects } from "@/hooks/use-managed-projects"
import { useProjectItems, type ProjectItemResolution } from "@/hooks/use-project-items"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { activityDetailHref, parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import OwnerByline from "@/components/ui/owner-byline"
import type { CollectionRecord } from "@/lib/atproto/collection"
import type { OwnerTag } from "@/lib/atproto/owner-tag"

interface ProfileProjectsProps {
  did: string
  /** True when the viewer is looking at their OWN profile (or
   *  acting-as the group whose profile is shown). Controls whether
   *  the Create new project CTA renders. */
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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Title A → Z" },
  { key: "alpha-desc", label: "Title Z → A" },
]

/** Cert rows shown inline per project before deferring to the project
 *  detail page via the "See all →" link. */
const CERTS_PER_PROJECT_PREVIEW = 5

/**
 * Projects tab — boxed sections.
 *
 * Each project gets its own bordered box: a hero image on the left,
 * title / description / "published" meta on the right, and a
 * "Certs" sub-section listing the cert items (image + title + time
 * period of work) underneath. Owners see a "Create new project"
 * CTA at the top; it links to `/project/new` (currently a
 * coming-soon placeholder while the editor is being built).
 */
export default function ProfileProjects({
  did,
  viewerIsOwner,
  aggregateOwned = false,
}: ProfileProjectsProps) {
  // On the viewer's own personal profile, aggregate projects owned by the
  // groups they own/admin (each tagged "by {group}"); elsewhere show just
  // this profile's own projects. Both hooks are always called; the inactive
  // one is disabled so it does no fetch.
  const single = useUserProjects(aggregateOwned ? null : did)
  const managed = useManagedProjects({ enabled: aggregateOwned })

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")
  const [sortOpen, setSortOpen] = useState(false)

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
  // single capped fetch (unchanged), so it never offers "Load more".
  const hasMore = aggregateOwned && managed.hasMore
  const isLoadingMore = aggregateOwned && managed.isLoadingMore

  const visible = useMemo(
    () => filterAndSort(projects, query, sort),
    [projects, query, sort],
  )

  const toolbar = (
    <div className="profile-projects__toolbar">
      <div className="profile-projects__controls">
        {viewerIsOwner ? (
          <Link href="/project/new">
            <Button variant="primary" size="sm">
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              New project
            </Button>
          </Link>
        ) : null}
        <label className="profile-certs__search">
          <Search
            size={16}
            strokeWidth={1.75}
            className="profile-certs__search-icon"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="profile-certs__search-input"
          />
        </label>

        <div className="profile-certs__sort-wrap">
          <Popover open={sortOpen} onOpenChange={setSortOpen}>
            <PopoverTrigger>
              <button
                type="button"
                className="profile-certs__sort-btn"
                aria-label="Sort projects"
                title="Sort"
              >
                <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end">
              {SORT_OPTIONS.map((opt) => (
                <PopoverItem
                  key={opt.key}
                  selected={opt.key === sort}
                  onClick={() => {
                    setSort(opt.key)
                    setSortOpen(false)
                  }}
                >
                  {opt.label}
                </PopoverItem>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )

  if (isLoading && projects.length === 0) {
    return (
      <div className="profile-projects">
        {toolbar}
        <div className="profile-projects__loading">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="profile-projects">
        {toolbar}
        <EmptyState
          icon={FolderGit2}
          title="Couldn't load projects"
          description={error}
        />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="profile-projects">
        {toolbar}
        <EmptyState
          icon={FolderGit2}
          title="No projects yet"
          description={
            viewerIsOwner
              ? "Create your first project to group related activities together."
              : "When this profile creates a project collection, it'll appear here."
          }
        />
      </div>
    )
  }

  return (
    <div className="profile-projects">
      {toolbar}
      {visible.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No projects match"
          description="Try a different search term."
        />
      ) : null}
      {visible.map((p) => (
        <ProjectBox key={p.uri} project={p} owner={ownerByUri?.get(p.uri)} />
      ))}
      {hasMore ? (
        <div className="profile-projects__more">
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
    </div>
  )
}

interface ProjectBoxProps {
  project: CollectionRecord
  /** Provenance tag when aggregating an own-profile view; group-owned
   *  boxes render a "by {group}" byline under the title. */
  owner?: OwnerTag
}

function ProjectBox({ project, owner }: ProjectBoxProps) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const projectDid = parsed?.did ?? ""
  const detailHref = parsed
    ? recordUrl(parsed.did, "project", parsed.rkey)
    : null

  const title =
    asString(value.title) || asString(value.name) || "Untitled project"
  const shortDesc = asString(value.shortDescription)
  const createdAt = asString(value.createdAt)
  const createdLabel = createdAt ? formatShortDate(createdAt) : null

  const { resolutions, isLoading } = useProjectItems(value.items)

  // Banner falls back to legacy `image`. Rendered much larger than
  // the previous compact thumbnail so the project reads as the
  // primary unit on the page.
  const rawImage = (value as Record<string, unknown>).banner ?? value.image
  const imageUrl =
    rawImage && projectDid
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          projectDid,
        )
      : null
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = !!imageUrl && !imageFailed

  const totalCerts = isLoading
    ? countActivityItems(value.items)
    : resolutions.length

  const previews = resolutions.slice(0, CERTS_PER_PROJECT_PREVIEW)
  const hiddenCount = Math.max(0, totalCerts - previews.length)

  // The head section (image + title + short desc + published-when)
  // is one tappable surface that goes to the project detail page.
  // Wrapping in a Link instead of only underlining the title gives
  // a much larger click target + the standard hover-background
  // affordance other card surfaces use. Nested anchors are invalid
  // HTML, but the head section has no inner links — the cert rows
  // below sit OUTSIDE this wrapper so they keep their own anchors.
  const HeadContents = (
    <>
      <div className="profile-projects__box-image-wrap">
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl!}
            alt=""
            className="profile-projects__box-image"
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className="profile-projects__box-image profile-projects__box-image--placeholder">
            <FolderGit2 size={40} strokeWidth={1.25} aria-hidden />
          </div>
        )}
      </div>

      <div className="profile-projects__box-meta">
        <div className="profile-projects__box-titleline">
          <h2 className="profile-projects__box-title">{title}</h2>
        </div>
        {owner && owner.kind === "group" && owner.group ? (
          <OwnerByline
            group={owner.group}
            role={owner.role}
            className="profile-projects__box-by"
          />
        ) : null}
        {shortDesc ? (
          <p className="profile-projects__box-desc">{shortDesc}</p>
        ) : null}
        {createdLabel ? (
          <p className="profile-projects__box-when">
            <Calendar size={12} strokeWidth={1.75} aria-hidden />
            <span>Published {createdLabel}</span>
          </p>
        ) : null}
      </div>
    </>
  )

  return (
    <section
      className="profile-projects__box"
      aria-label={title}
    >
      {detailHref ? (
        <Link
          href={detailHref}
          className="profile-projects__box-head profile-projects__box-head--link"
          aria-label={`Open ${title}`}
        >
          {HeadContents}
        </Link>
      ) : (
        <header className="profile-projects__box-head">{HeadContents}</header>
      )}

      <div className="profile-projects__box-certs">
        <div className="profile-projects__box-certs-head">
          <h3 className="profile-projects__box-certs-title">Activities</h3>
          <span className="profile-projects__box-certs-count">
            {totalCerts}
          </span>
        </div>

        {isLoading && previews.length === 0 ? (
          <div className="profile-projects__section-loading">
            <LoadingSpinner size="sm" />
          </div>
        ) : previews.length === 0 ? (
          <p className="profile-projects__section-empty">
            <CertIcon size={14} strokeWidth={1.5} aria-hidden /> No activities in this
            project yet.
          </p>
        ) : (
          <>
            <ul className="profile-projects__cert-list">
              {previews.map((r) =>
                r.record && r.did ? (
                  <CertRow key={r.uri} resolution={r} />
                ) : null,
              )}
            </ul>
            {detailHref && hiddenCount > 0 ? (
              <Link href={detailHref} className="profile-projects__box-see-all">
                See all {totalCerts} activities
                <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

interface CertRowProps {
  resolution: ProjectItemResolution
}

function CertRow({ resolution }: CertRowProps) {
  const { record, did } = resolution
  if (!record || !did) return null
  const parsed = parseAtUri(record.uri)
  const rkey = parsed?.rkey ?? ""
  const href = activityDetailHref(did, rkey)
  const title = asString(record.value.title) || "Untitled activity"
  const imageUrl = record.value.image
    ? resolveActivityImageUrl(record.value.image, did)
    : null
  const period = formatTimePeriod(
    asString(record.value.startDate),
    asString(record.value.endDate),
  )
  return (
    <li className="profile-projects__cert-row">
      <Link
        href={href}
        className="profile-projects__cert-link"
        title={title}
      >
        <CertThumb url={imageUrl} />
        <span className="profile-projects__cert-meta">
          <span className="profile-projects__cert-title">{title}</span>
          {period ? (
            <span className="profile-projects__cert-period">
              <Calendar size={12} strokeWidth={1.75} aria-hidden />
              {period}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function CertThumb({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <span className="profile-projects__cert-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      </span>
    )
  }
  return (
    <span className="profile-projects__cert-thumb profile-projects__cert-thumb--placeholder">
      <CertIcon size={16} strokeWidth={1.5} aria-hidden />
    </span>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function projectTitle(p: CollectionRecord): string {
  return asString(p.value.title) || asString(p.value.name) || "Untitled project"
}

function filterAndSort(
  projects: CollectionRecord[],
  query: string,
  sort: SortKey,
): CollectionRecord[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? projects.filter((p) => {
        const t = projectTitle(p).toLowerCase()
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
        return projectTitle(a).localeCompare(projectTitle(b))
      case "alpha-desc":
        return projectTitle(b).localeCompare(projectTitle(a))
    }
  })
  return sorted
}

function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Render the cert's time period exactly the way the cert detail page
 * formats it — so the row reads the same whether the user sees it
 * here or on the cert itself.
 *
 *   - both set    → "Jan 1, 2026 – Mar 15, 2026"
 *   - only start  → "Jan 1, 2026 (ongoing)"
 *   - only end    → "Until Mar 15, 2026"
 *   - neither     → null (caller skips the row)
 */
function formatTimePeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const s = start ? formatShortDate(start) : null
  const e = end ? formatShortDate(end) : null
  if (s && e) return `${s} – ${e}`
  if (s) return `${s} (ongoing)`
  if (e) return `Until ${e}`
  return null
}

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
