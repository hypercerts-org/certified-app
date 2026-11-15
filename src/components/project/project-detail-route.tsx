"use client"

import { useEffect } from "react"
import { FolderGit2 } from "lucide-react"
import { PROJECT_NOT_FOUND, useProject } from "@/hooks/use-project"
import ProjectDetail from "@/components/project/project-detail"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import ErrorMessage from "@/components/ui/error-message"
import NotFoundMarker from "@/components/layout/not-found-marker"
import PageContainer from "@/components/ui/page-container"
import { RecordDetailSkeleton } from "@/components/feed/cert-detail-parts"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

/**
 * Project detail body, rendered by the handle-forward record route
 * `/{actor}/project/{rkey}`. The actor is resolved to a DID + handle by the
 * parent route; this component fetches and renders the record.
 *
 * `resolving` is true while the parent is still turning the actor segment
 * into a DID; we stay in the loading state instead of flashing "not found".
 * A project that doesn't exist says so (no retry: it can't succeed); one
 * that couldn't be read is an inline block with "Try again".
 *
 * Every state renders inside `<PageContainer>` (the page frame: width,
 * gutters, top and bottom space), so the page doesn't jump between them.
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
  const { project, isLoading, error, refetch } = useProject(did, rkey)

  // Recently-viewed: record the at:// URI once the project resolves so
  // the /explore "Recently viewed" filter can surface it later.
  useEffect(() => {
    if (project?.uri) trackRecentlyViewed("project", project.uri)
  }, [project?.uri])

  if (resolving || isLoading) {
    return (
      <PageContainer>
        <RecordDetailSkeleton label="Loading project" />
      </PageContainer>
    )
  }

  if (error && error !== PROJECT_NOT_FOUND) {
    return (
      <PageContainer>
        <ErrorMessage
          title="Couldn't load this project"
          message="Its account's server didn't answer. Try again in a moment."
          onRetry={refetch}
        />
      </PageContainer>
    )
  }

  if (!project || !rkey) {
    return (
      <PageContainer>
        <NotFoundMarker />
        <EmptyState
          icon={FolderGit2}
          title="Project not found"
          description="It may have been deleted, or the link is wrong."
          headingLevel={2}
        >
          <Button href="/explore" variant="secondary" size="sm">
            Go to Explore
          </Button>
        </EmptyState>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="project-detail-page">
        <ProjectDetail
          did={project.did}
          rkey={rkey}
          value={project.value}
          cid={project.cid}
          handle={handle}
        />
      </div>
    </PageContainer>
  )
}
