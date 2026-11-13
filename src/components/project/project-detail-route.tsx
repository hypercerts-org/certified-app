"use client"

import { useEffect } from "react"
import { FolderGit2 } from "lucide-react"
import { useProject } from "@/hooks/use-project"
import ProjectDetail from "@/components/project/project-detail"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import PageContainer from "@/components/ui/page-container"
import { RecordDetailSkeleton } from "@/components/feed/cert-detail-parts"
import { trackRecentlyViewed } from "@/lib/utils/recently-viewed"

/**
 * Project detail body, rendered by the handle-forward record route
 * `/{actor}/project/{rkey}`. The actor is resolved to a DID + handle by the
 * parent route; this component fetches and renders the record.
 *
 * `resolving` is true while the parent is still turning the actor segment
 * into a DID — we stay in the loading state instead of flashing "not found".
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
  const { project, isLoading, error } = useProject(did, rkey)

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

  if (error || !project || !rkey) {
    return (
      <PageContainer>
        <EmptyState
          icon={FolderGit2}
          title={
            error && error !== "Project not found"
              ? "Couldn't load this project"
              : "Project not found"
          }
          description="This project may have been deleted, or its account's server is unreachable right now. Try again later."
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
