import type { Group } from "./types"

/**
 * Single source of truth for the URL we navigate to after the user
 * switches actor in the account switcher.
 *
 * Personal → "/" (which redirects to the user's profile)
 * Group    → "/profile/<encoded-handle>" — the profile route now
 *            handles both individual and group actors, with admin
 *            affordances exposed when the viewer has owner/admin role.
 *            Falls back to "/groups/<encoded-did>" (which itself
 *            redirects server-side to /profile/<handle>) when we don't
 *            have a handle on file — strictly belt-and-suspenders for
 *            an edge case that should never fire because the org list
 *            always includes a handle.
 */
export function resolvePostSwitchPath(next: Group | null): string {
  if (!next) return "/"
  if (next.handle) return `/profile/${encodeURIComponent(next.handle)}`
  return `/groups/${encodeURIComponent(next.groupDid)}`
}
