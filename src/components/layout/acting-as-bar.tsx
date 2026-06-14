"use client"

import { useEffect } from "react"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useScrollHideNavbar } from "@/hooks/use-scroll-hide-navbar"

/**
 * Full-width banner pinned above the page chrome whenever the viewer is
 * acting AS a group (delegation). It names the org being operated, the
 * operator's own handle, and the role, and offers a one-click escape back
 * to the personal account. Renders nothing for personal sessions (the
 * common case), so it never appears on signed-out routes where activeOrg
 * is always null.
 *
 * On mobile the bar is fixed: it sits just below the navbar while the
 * navbar is shown, and slides to the very top when the navbar auto-hides
 * on scroll (so it's never tucked behind the fixed navbar). It flags the
 * document with `has-acting-as-bar` so the app-shell can reserve the
 * extra top space the fixed bar would otherwise overlay.
 */
export default function ActingAsBar() {
  const { activeOrg, switchOrg } = useOrg()
  const { handle } = useSession()
  const { navHidden } = useScrollHideNavbar()
  const active = !!activeOrg

  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.classList.add("has-acting-as-bar")
    return () => root.classList.remove("has-acting-as-bar")
  }, [active])

  if (!activeOrg) return null

  return (
    <div
      className={`acting-as-bar${navHidden ? " acting-as-bar--nav-hidden" : ""}`}
      role="status"
    >
      <p className="acting-as-bar__text">
        Operating <b>{activeOrg.displayName || activeOrg.handle}</b> as @{handle}{" "}
        ({activeOrg.role})
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
