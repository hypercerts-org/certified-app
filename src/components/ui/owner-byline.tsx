"use client"

import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import type { Group, OrgRole } from "@/lib/groups/types"

export interface OwnerBylineProps {
  /** The owning group whose name + avatar the byline surfaces. */
  group: Group
  /** The viewer's role on the group, if announced alongside the name. */
  role?: OrgRole
  className?: string
}

/**
 * Compact "by {group}" provenance line for dense aggregated rows.
 *
 * Unlike the 3-line {@link IdentityRow} (avatar + name + @handle), this
 * is a single muted line — a 14px group avatar followed by the group's
 * name — sized to tuck under a list-row label without changing the row's
 * vertical rhythm much. Used on the Home sidebar's "My projects" / "My
 * activities" rows and the profile Projects tab to mark records owned by a
 * group the viewer manages rather than by the viewer's personal account.
 *
 * Presentation-only and token-correct; the avatar's own border + the
 * `--fg-muted` text both flip with the theme.
 */
export default function OwnerByline({ group, role, className = "" }: OwnerBylineProps) {
  const name = group.displayName || group.handle || "Group"
  const initials = getInitials(group.displayName ?? group.handle, group.groupDid)

  return (
    // The visible "by {name}" text IS the accessible name — read naturally
    // by assistive tech. A bare aria-label on a roleless span isn't reliably
    // announced, so we let the real text carry the meaning and only hide the
    // decorative avatar. The role (when shown) is appended sr-only so screen
    // readers get "by {name}, {role}" without changing the compact visual.
    <span className={`owner-byline${className ? ` ${className}` : ""}`}>
      <span className="owner-byline__label">by</span>
      <span className="owner-byline__avatar" aria-hidden="true">
        <Avatar size="sm" src={group.avatarUrl} alt="" fallbackInitials={initials} />
      </span>
      <span className="owner-byline__name">{name}</span>
      {role ? <span className="sr-only">, {role}</span> : null}
    </span>
  )
}
