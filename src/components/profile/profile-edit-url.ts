import { ownProfileUrl, profileUrl } from "@/lib/urls"

/** The query that opens the inline profile editor (see `[actor]/page.tsx`). */
export const PROFILE_EDIT_QUERY = "edit=1"

/**
 * "Edit profile" for an account the viewer can edit: its profile with the
 * inline editor open. `actor` is a handle (preferred) or a DID. The editor
 * only opens for the account itself (the personal account with no group
 * active, or a group while acting as it); anyone else just sees the
 * profile.
 */
export function profileEditUrl(actor: string): string {
  return `${profileUrl(actor)}?${PROFILE_EDIT_QUERY}`
}

/**
 * "Edit profile" for whichever identity the viewer is acting as: the
 * active group, or the personal account. Falls back to `/profile` (which
 * redirects once the session resolves) when neither is known yet.
 */
export function ownProfileEditUrl(
  args: Parameters<typeof ownProfileUrl>[0],
): string {
  const url = ownProfileUrl(args)
  return url === "/profile" ? url : `${url}?${PROFILE_EDIT_QUERY}`
}
