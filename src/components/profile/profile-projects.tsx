"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Award, FolderGit2 } from "lucide-react"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import ActivityCard from "@/components/feed/activity-card"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useProjectItems } from "@/hooks/use-project-items"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { CollectionRecord } from "@/lib/atproto/collection"

interface ProfileProjectsProps {
  did: string
}

/** Max cert cards we render inline per project before deferring to the
 *  project detail page via the "See all →" link. Three matches the
 *  certs-grid breakpoint so a section's cert row fills exactly one row
 *  at desktop width. */
const CERTS_PER_PROJECT_PREVIEW = 3

/**
 * Projects tab — sectioned layout.
 *
 * Each project gets its own section (header + a row of up to three
 * cert cards). Pattern mirrors GitHub pinned-repos / Behance
 * collections / a user's GitHub Organization page: scannable from top
 * to bottom, each section is its own surface with a clear "See all →"
 * deep link into the project detail page.
 *
 * Data source: `com.atproto.repo.listRecords` for the user's projects
 * (via `useUserProjects`), then `getRecord` per item to hydrate the
 * cert cards inside each section (via `useProjectItems`). The indexer
 * gets to skip this for now — `eqi` (case-insensitive type filter) is
 * still on PR hb-agent/magic-indexer#81 and not deployed.
 */
export default function ProfileProjects({ did }: ProfileProjectsProps) {
  const { projects, isLoading, error } = useUserProjects(did)

  if (isLoading && projects.length === 0) {
    return (
      <div className="profile-projects__loading">
        <LoadingSpinner size="sm" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="Couldn't load projects"
        description={error}
      />
    )
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="No projects yet"
        description="When this profile creates a project collection, it'll appear here."
      />
    )
  }

  return (
    <div className="profile-projects">
      {projects.map((p) => (
        <ProjectSection key={p.uri} project={p} />
      ))}
    </div>
  )
}

interface ProjectSectionProps {
  project: CollectionRecord
}

function ProjectSection({ project }: ProjectSectionProps) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const projectDid = parsed?.did ?? ""
  const detailHref = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null

  const title =
    asString(value.title) || asString(value.name) || "Untitled project"
  const shortDesc = asString(value.shortDescription)

  // Hydrate the items array via `getRecord` per strong-ref. The hook
  // skips non-activity collections so the cards rendered below are
  // always cert cards.
  const { resolutions, isLoading } = useProjectItems(value.items)

  // Image: same hero shape as the project detail page (banner falls
  // back to legacy `image`). Used only for the section header thumb.
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

  // Total cert count comes from the resolutions list (which already
  // filtered non-activity items). Until the resolutions arrive, fall
  // back to a best-effort raw count of activity-typed items so the
  // header doesn't flash "0 certs".
  const totalCerts = isLoading
    ? countActivityItems(value.items)
    : resolutions.length

  const previews = resolutions.slice(0, CERTS_PER_PROJECT_PREVIEW)
  const hiddenCount = Math.max(0, totalCerts - previews.length)

  const header = (
    <div className="profile-projects__section-head">
      <div className="profile-projects__section-thumb-wrap">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt=""
            className="profile-projects__section-thumb"
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className="profile-projects__section-thumb profile-projects__section-thumb--placeholder">
            <FolderGit2 size={20} strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>

      <div className="profile-projects__section-meta">
        <div className="profile-projects__section-titleline">
          {detailHref ? (
            <Link
              href={detailHref}
              className="profile-projects__section-title-link"
            >
              <h2 className="profile-projects__section-title">{title}</h2>
            </Link>
          ) : (
            <h2 className="profile-projects__section-title">{title}</h2>
          )}
          <span className="profile-projects__section-count">
            {totalCerts === 1 ? "1 cert" : `${totalCerts} certs`}
          </span>
        </div>
        {shortDesc ? (
          <p className="profile-projects__section-desc">{shortDesc}</p>
        ) : null}
      </div>

      {detailHref && hiddenCount > 0 ? (
        <Link href={detailHref} className="profile-projects__see-all">
          See all <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      ) : null}
    </div>
  )

  return (
    <section className="profile-projects__section" aria-label={title}>
      {header}

      {isLoading && previews.length === 0 ? (
        <div className="profile-projects__section-loading">
          <LoadingSpinner size="sm" />
        </div>
      ) : previews.length === 0 ? (
        <p className="profile-projects__section-empty">
          <Award size={14} strokeWidth={1.5} aria-hidden /> No certs in this
          project yet.
        </p>
      ) : (
        <ul className="profile-projects__section-grid">
          {previews.map((r) =>
            r.record && r.did ? (
              <li key={r.uri}>
                <ActivityCard record={r.record} did={r.did} />
              </li>
            ) : null,
          )}
        </ul>
      )}
    </section>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
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
