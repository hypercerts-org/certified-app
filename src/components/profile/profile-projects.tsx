"use client"

import { FolderGit2 } from "lucide-react"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useUserProjects } from "@/hooks/use-user-projects"
import { formatShortDate } from "@/lib/utils/format-date"

interface ProfileProjectsProps {
  did: string
}

/**
 * Projects tab content — lists `org.hypercerts.collection` records on
 * the profile's PDS where `record.value.type === "project"`.
 *
 * Rows are display-only for now; once the collection lexicon has a
 * canonical detail page in this app, the title can wrap in a <Link>.
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
    <ul className="profile-projects">
      {projects.map((p) => {
        const title =
          (typeof p.value.title === "string" && p.value.title) ||
          (typeof p.value.name === "string" && p.value.name) ||
          "Untitled project"
        const description =
          (typeof p.value.shortDescription === "string" && p.value.shortDescription) ||
          (typeof p.value.description === "string" && p.value.description) ||
          null
        return (
          <li key={p.uri} className="profile-projects__item">
            <div className="profile-projects__icon">
              <FolderGit2 size={18} strokeWidth={1.75} aria-hidden />
            </div>
            <div className="profile-projects__body">
              <p className="profile-projects__title">{title}</p>
              {description ? (
                <p className="profile-projects__desc">{description}</p>
              ) : null}
              {p.value.createdAt ? (
                <p className="profile-projects__meta">
                  Created {formatShortDate(p.value.createdAt)}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
