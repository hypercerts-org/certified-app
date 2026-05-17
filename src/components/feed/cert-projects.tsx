"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderGit2 } from "lucide-react"
import { useCertProjects } from "@/hooks/use-cert-projects"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { CollectionRecord } from "@/lib/atproto/collection"

interface CertProjectsProps {
  did: string
  rkey: string
}

/**
 * "Project" section for the cert detail left pane.
 *
 * Renders a small row per project (thumbnail + name + short
 * description) when the cert is referenced by at least one
 * `org.hypercerts.collection` record with `type === "project"`.
 * The component returns null when there are no projects so the
 * containing aside can skip the heading entirely.
 */
export default function CertProjects({ did, rkey }: CertProjectsProps) {
  const { projects, isLoading } = useCertProjects(did, rkey)

  if (isLoading && projects.length === 0) {
    // We don't want a loading flash on the sidebar — the section
    // is collapsed when empty, so just return null while we wait.
    // If the cert actually belongs to a project, the row pops in
    // on the next render.
    return null
  }

  if (projects.length === 0) return null

  return (
    <section className="cert-detail__projects" aria-label="Project">
      <h2 className="cert-detail__section-title cert-detail__section-title--aside">
        Project
      </h2>
      <ul className="cert-detail__projects-list">
        {projects.map((p) => (
          <ProjectRow key={p.uri} project={p} />
        ))}
      </ul>
    </section>
  )
}

interface ProjectRowProps {
  project: CollectionRecord
}

function ProjectRow({ project }: ProjectRowProps) {
  const { uri, value } = project
  const parsed = parseAtUri(uri)
  const detailHref = parsed
    ? `/project/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`
    : null

  const title =
    asString(value.title) || asString(value.name) || "Untitled project"
  const shortDesc = asString(value.shortDescription)

  // Project records may store the hero under `banner` (newer) or
  // `image` (legacy) — same fallback the profile projects tab uses.
  const rawImage = (value as Record<string, unknown>).banner ?? value.image
  const projectDid = parsed?.did ?? ""
  const imageUrl =
    rawImage && projectDid
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          projectDid,
        )
      : null
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = !!imageUrl && !imageFailed

  const inner = (
    <>
      <span className="cert-detail__project-thumb-wrap" aria-hidden="true">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt=""
            className="cert-detail__project-thumb"
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        ) : (
          <span className="cert-detail__project-thumb cert-detail__project-thumb--placeholder">
            <FolderGit2 size={14} strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </span>
      <span className="cert-detail__project-meta">
        <span className="cert-detail__project-name">{title}</span>
        {shortDesc ? (
          <span className="cert-detail__project-desc">{shortDesc}</span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="cert-detail__project">
      {detailHref ? (
        <Link href={detailHref} className="cert-detail__project-link">
          {inner}
        </Link>
      ) : (
        <span className="cert-detail__project-link cert-detail__project-link--static">
          {inner}
        </span>
      )}
    </li>
  )
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}
