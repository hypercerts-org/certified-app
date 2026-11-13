"use client"

import { useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useOrg } from "./org-context"
import { routeForActorSwitch } from "./navigation"
import type { Group } from "./types"

/**
 * Switch who the viewer acts as: `null` for the personal account, or one
 * of their groups. Used by the account menu, the acting-as bar and the
 * Records "Switch to personal account" button, so every switch behaves
 * the same way.
 *
 * The viewer stays on the current page (query string included) unless the
 * page is personal-only and the new actor is a group, in which case
 * `routeForActorSwitch` sends them to /home.
 */
export function useSwitchActor(): (next: Group | null) => void {
  const { switchOrg } = useOrg()
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    (next: Group | null) => {
      switchOrg(next)
      const target = routeForActorSwitch(pathname, next)
      if (target !== pathname) router.push(target)
    },
    [switchOrg, router, pathname],
  )
}
