"use client"

import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import type { Group, OrgRole } from "@/lib/groups/types"

export interface ViaBylineProps {
  /** The owning group whose name + avatar the byline surfaces. */
  group: Group
  /** The viewer's role on the group, if shown alongside the name. */
  role?: OrgRole
  className?: string
}

/**
 * Compact "via {group}" provenance line for dense aggregated rows.
 *
 * Unlike the 3-line {@link IdentityRow} (avatar + name + @handle), this
 * is a single muted line — a 14px group avatar followed by the group's
 * name — sized to tuck under a list-row label without changing the
 * row's vertical rhythm much. Used on Home's "My projects" / "My
 * activities" rows to mark records owned by a group rather than the
 * viewer's personal account.
 *
 * Presentation-only and token-correct; the avatar's own border + the
 * `--fg-muted` text both flip with the theme.
 */
export default function ViaByline({ group, role, className = "" }: ViaBylineProps) {
  const name = group.displayName || group.handle || "Group"
  const initials = getInitials(group.displayName ?? group.handle, group.groupDid)

  return (
    <span
      className={`via-byline${className ? ` ${className}` : ""}`}
      // Spelled out for assistive tech — the visual avatar is decorative.
      aria-label={`via ${name}${role ? ` (${role})` : ""}`}
    >
      <span className="via-byline__label" aria-hidden="true">
        via
      </span>
      <span className="via-byline__avatar" aria-hidden="true">
        <Avatar size="sm" src={group.avatarUrl} alt="" fallbackInitials={initials} />
      </span>
      <span className="via-byline__name" aria-hidden="true">
        {name}
      </span>
    </span>
  )
}
