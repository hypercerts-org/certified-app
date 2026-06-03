"use client"

import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"

/**
 * Full-width bar pinned above the page chrome whenever the viewer is
 * operating a group (READ-SCOPE delegation). It names the org being
 * operated, the operator's own handle, and the role, and offers a
 * one-click escape back to the personal account. Renders nothing for
 * personal sessions (the common case), so it never appears on signed-out
 * routes where activeOrg is always null.
 *
 * Treatment is a NEUTRAL elevated "mode" strip (accent left-rule +
 * --fg-secondary text), deliberately NOT the warning/amber-style
 * inverted primary it used to be: acting-as is read-scope, not a
 * write-identity switch, so the bar must not imply "everything you post
 * now goes out as the group." The "Posts ask each time" hint makes that
 * explicit — per-action identity comes from the in-form posting picker
 * (default You), never from this bar.
 */
export default function ActingAsBar() {
  const { activeOrg, switchOrg } = useOrg()
  const { handle } = useSession()

  if (!activeOrg) return null

  return (
    <div className="acting-as-bar" role="status">
      <div className="acting-as-bar__body">
        <p className="acting-as-bar__text">
          Operating <b>{activeOrg.displayName || activeOrg.handle}</b> as @
          {handle} ({activeOrg.role})
        </p>
        <span className="acting-as-bar__hint">Posts ask each time</span>
      </div>
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
