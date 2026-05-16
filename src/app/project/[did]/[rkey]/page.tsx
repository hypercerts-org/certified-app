"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { usePageTitle, usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useProject } from "@/hooks/use-project"
import { useAuthorInfo } from "@/hooks/use-author-info"
import ProjectDetail from "@/components/project/project-detail"
import LoadingSpinner from "@/components/ui/loading-spinner"

export default function ProjectDetailPage() {
  // Plain-string fallback while author/project data is still resolving.
  // The breadcrumb below takes precedence once both pieces are available.
  usePageTitle("Project")

  const params = useParams()
  const did = useMemo(() => {
    const raw = params.did
    if (typeof raw !== "string") return null
    return decodeURIComponent(raw)
  }, [params.did])
  const rkey = useMemo(() => {
    const raw = params.rkey
    if (typeof raw !== "string") return null
    return decodeURIComponent(raw)
  }, [params.rkey])

  const { project, isLoading, error } = useProject(did, rkey)
  const { info: authorInfo } = useAuthorInfo(did)

  const handle = authorInfo?.handle ?? null
  const projectTitle =
    (typeof project?.value.title === "string" && project.value.title) ||
    (typeof project?.value.name === "string" && project.value.name) ||
    null
  usePageTitleBreadcrumb(
    handle && projectTitle && did && rkey
      ? {
          left: {
            text: `@${handle}`,
            href: `/profile/${encodeURIComponent(handle)}`,
          },
          right: {
            text: projectTitle,
            href: `/project/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
          },
        }
      : null,
  )

  if (isLoading) {
    return (
      <div className="project-detail-page">
        <div className="project-detail__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="project-detail-page">
        <div className="project-detail__error">
          <p className="project-detail__error-title">
            {error || "Project not found"}
          </p>
          <p className="project-detail__error-desc">
            This project may have been deleted or is on a PDS we can&rsquo;t
            reach.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="project-detail-page">
      <ProjectDetail did={project.did} value={project.value} />
    </div>
  )
}
