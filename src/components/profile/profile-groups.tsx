"use client"

import Link from "next/link"
import { Building2 } from "lucide-react"
import { useUserGroups } from "@/hooks/use-user-groups"
import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"

interface ProfileGroupsProps {
  did: string
  /** When false, the per-group role badge (owner/admin/member) is hidden.
   *  Roles are a viewer's-own concern, not public information. */
  showRoles?: boolean
}

/**
 * Groups the profile is a member of. Each row links to the group's
 * profile page at `/profile/<group-handle>`.
 */
export default function ProfileGroups({ did, showRoles = false }: ProfileGroupsProps) {
  const { groups, isLoading, error } = useUserGroups(did)

  if (isLoading) {
    return (
      <div className="profile-groups__loading">
        <LoadingSpinner size="sm" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={Building2}
        title="Couldn't load groups"
        description={error}
      />
    )
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No groups yet"
        description="When this profile joins a group, it'll show up here."
      />
    )
  }

  return (
    <ul className="profile-groups">
      {groups.map((g) => {
        const name = g.displayName || g.handle
        return (
          <li key={g.groupDid} className="profile-groups__item">
            <Link
              href={`/profile/${encodeURIComponent(g.handle)}`}
              className="profile-groups__link"
            >
              <Avatar
                size="sm"
                src={g.avatarUrl}
                fallbackInitials={getInitials(name, g.groupDid)}
                alt={name}
              />
              <div className="profile-groups__meta">
                <span className="profile-groups__name">{name}</span>
                <span className="profile-groups__handle">@{g.handle}</span>
              </div>
              {showRoles && g.role ? (
                <span className="profile-groups__role">{g.role}</span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
