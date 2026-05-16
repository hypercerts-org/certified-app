"use client"

import { FolderGit2 } from "lucide-react"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useUserProjects } from "@/hooks/use-user-projects"
import ProjectCard from "./project-card"

interface ProfileProjectsProps {
  did: string
}

/**
 * Projects tab on a user's profile.
 *
 * Lists `org.hypercerts.collection` records on the profile's PDS where
 * `record.value.type === "project"`, rendered as a card grid mirroring
 * the visual language of the Certs tab (see `.profile-certs` and the
 * shared breakpoints in `profile-projects.css`).
 *
 * Data source: `com.atproto.repo.listRecords` against the user's PDS,
 * filtered client-side by `value.type`. The indexer's `eqi`
 * (case-insensitive eq) operator isn't deployed yet — once it lands
 * (PR hb-agent/magic-indexer#81) the hook can swap to a `where: { type:
 * { eqi: "project" } }` query for richer filters across DIDs. Until
 * then, per-DID listRecords is both simpler and fresher than a strict
 * `eq: "project"` query (which would miss records casing variants like
 * "Project" or "PROJECT").
 */
export default function ProfileProjects({ did }: ProfileProjectsProps) {
  const { projects, isLoading, error } = useUserProjects(did)

  if (isLoading && projects.length === 0) {
    return (
      <div className="profile-projects-grid__loading">
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
    <div className="profile-projects-grid">
      <ul className="profile-projects-grid__list">
        {projects.map((p) => (
          <li key={p.uri}>
            <ProjectCard record={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}
