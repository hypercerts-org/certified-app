"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useOrg } from "@/lib/groups/org-context"
import { useSwitchActor } from "@/lib/groups/use-switch-actor"
import { useSession } from "@/hooks/use-session"

/**
 * Full-width banner whenever the viewer is acting AS a group (delegation).
 * It names the group being operated, the operator's own handle, and the
 * role, and offers a one-click escape back to the personal account (the
 * same switch the account menu uses). Renders nothing for personal
 * sessions (the common case), so it never appears on signed-out routes
 * where activeOrg is always null.
 *
 * Desktop: in flow above the desktop top bar. Phones: fixed just below the
 * fixed top bar, which stays pinned while acting as a group. It flags the
 * document with `has-acting-as-bar` so the app shell can reserve the extra
 * top space the fixed bar would otherwise overlay.
 */
export default function ActingAsBar() {
  const { activeOrg } = useOrg()
  const switchActor = useSwitchActor()
  const { handle } = useSession()
  const pathname = usePathname()
  // Embeds render bare inside a third-party iframe — no chrome.
  const active = !!activeOrg && !(pathname?.startsWith("/embed") ?? false)

  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.classList.add("has-acting-as-bar")
    return () => root.classList.remove("has-acting-as-bar")
  }, [active])

  if (!active || !activeOrg) return null

  return (
    <div className="acting-as-bar" role="status">
      <p className="acting-as-bar__text">
        Operating <b>{activeOrg.displayName || activeOrg.handle}</b>
        {handle ? ` as @${handle}` : ""} ({activeOrg.role})
      </p>
      <button
        type="button"
        className="acting-as-bar__switch"
        onClick={() => switchActor(null)}
      >
        Switch to personal
      </button>
    </div>
  )
}
