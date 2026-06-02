"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Calendar, FolderGit2, Plus } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useUserProjects } from "@/hooks/use-user-projects"
import { useProjectItems, type ProjectItemResolution } from "@/hooks/use-project-items"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { activityDetailHref, parseAtUri } from "@/lib/atproto/activity-uri"
import { formatShortDate } from "@/lib/utils/format-date"
import type { CollectionRecord } from "@/lib/atproto/collection"

interface ProfileProjectsProps {
  did: string
  /** True when the viewer is looking at their OWN profile (or
   *  acting-as the group whose profile is shown). Controls whether
   *  the Create new project CTA renders. */
  viewerIsOwner?: boolean
}

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
export default function ProfileProjects({ did, viewerIsOwner }: ProfileProjectsProps) {
  const { projects, isLoading, error } = useUserProjects(did)

  const createCta = viewerIsOwner ? (
    <div className="profile-projects__toolbar">
      <Link href="/project/new">
        <Button variant="primary" size="sm">
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          New project
        </Button>
      </Link>
    </div>
  ) : null

  if (isLoading && projects.length === 0) {
    return (
      <div className="profile-projects">
        {createCta}
        <div className="profile-projects__loading">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="profile-projects">
        {createCta}
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
        {createCta}
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
      {createCta}
      {projects.map((p) => (
        <ProjectBox key={p.uri} project={p} />
      ))}
    </div>
  )
}

interface ProjectBoxProps {
  project: CollectionRecord
}

function ProjectBox({ project }: ProjectBoxProps) {
  const { value, uri } = project
  const parsed = parseAtUri(uri)
  const projectDid = parsed?.did ?? ""
  const detailHref = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
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
