"use client"

import { useEffect } from "react"
import { usePageTitle, usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useProject } from "@/hooks/use-project"
import ProjectDetail from "@/components/project/project-detail"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"
import { profileUrl, recordUrl } from "@/lib/urls"

/**
 * Project detail body, rendered by the handle-forward record route
 * `/{actor}/project/{rkey}`. The actor is resolved to a DID + handle by the
 * parent route; this component fetches and renders the record.
 *
 * `resolving` is true while the parent is still turning the actor segment
 * into a DID — we stay in the loading state instead of flashing "not found".
 */
export default function ProjectDetailRoute({
  did,
  handle,
  rkey,
  resolving,
}: {
  did: string | null
  handle: string | null
  rkey: string | null
  resolving: boolean
}) {
  // Plain-string fallback while author/project data is still resolving.
  usePageTitle("Project")

  const { project, isLoading, error } = useProject(did, rkey)

  // Recently-viewed: record the at:// URI once the project resolves so
  // the /explore "Recently viewed" filter can surface it later.
  useEffect(() => {
    if (project?.uri) trackRecentlyViewed("project", project.uri)
  }, [project?.uri])

  const projectTitle =
    (typeof project?.value.title === "string" && project.value.title) ||
    (typeof project?.value.name === "string" && project.value.name) ||
    null
  usePageTitleBreadcrumb(
    handle && projectTitle && rkey
      ? {
          left: { text: handle, href: profileUrl(handle) },
          right: { text: projectTitle, href: recordUrl(handle, "project", rkey) },
        }
      : null,
  )

  if (resolving || isLoading) {
    return (
      <div className="project-detail-page">
        <div className="project-detail__loading">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (error || !project || !rkey) {
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
      <ProjectDetail
        did={project.did}
        rkey={rkey}
        value={project.value}
        cid={project.cid}
      />
    </div>
  )
}
