"use client"

import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"

/**
 * Full-width banner pinned above the page chrome whenever the viewer is
 * acting AS a group (delegation). It names the org being operated, the
 * operator's own handle, and the role, and offers a one-click escape back
 * to the personal account. Renders nothing for personal sessions (the
 * common case), so it never appears on signed-out routes where activeOrg
 * is always null.
 */
export default function ActingAsBar() {
  const { activeOrg, switchOrg } = useOrg()
  const { handle } = useSession()

  if (!activeOrg) return null

  return (
    <div className="acting-as-bar" role="status">
      <p className="acting-as-bar__text">
        Operating <b>{activeOrg.displayName || activeOrg.handle}</b> as @{handle} ({activeOrg.role})
      </p>
      <button
        type="button"
        className="acting-as-bar__switch"
        onClick={() => switchOrg(null)}
      >
        Switch to personal
      </button>
    </div>
  )
}
