"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  CONFIRM_ROLES,
  DEFAULT_CONFIRM_ROLES,
  isDefaultConfirmRoleSet,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"

/** Sentinel for an "explicitly empty" selection in a URL param whose absence
 *  means "default" — mirrors the /explore degree + quality filters, so an
 *  empty role set survives a reload instead of snapping back to all-three. */
const EMPTY_SELECTION_SENTINEL = "-"

export interface FundingConfirmedByState {
  /** Selected buckets (default: {@link DEFAULT_CONFIRM_ROLES} — trusted
   *  sources + both sides). */
  roles: Set<ConfirmRole>
  /** Selected third-party attestor DIDs (default: none). */
  thirdParties: Set<string>
  /** True when the selection equals the default (trusted sources + both
   *  sides, no third parties). */
  isDefault: boolean
  toggleRole: (role: ConfirmRole) => void
  toggleThirdParty: (did: string) => void
  reset: () => void
}

/**
 * URL-backed state for the Funding "Confirmed by" filter, shared by /explore
 * the activity detail page and /funding so every surface behaves identically.
 * Two axes whose UNION is shown: the buckets (`?confirmedRoles=`, default
 * trusted sources + both sides) and a set of specific third-party
 * attestor DIDs (`?confirmedTp=`, default none). Filtering itself is
 * client-side via {@link matchesConfirmedBy} — the role buckets aren't a
 * single indexer arg. Only the params this filter owns are touched; every
 * other query param (tab, sort, …) is preserved.
 */
function parseRoles(param: string | null): Set<ConfirmRole> {
  if (param == null) return new Set(DEFAULT_CONFIRM_ROLES)
  if (param === EMPTY_SELECTION_SENTINEL) return new Set()
  const valid = new Set<string>(CONFIRM_ROLES)
  return new Set(param.split(",").filter((v): v is ConfirmRole => valid.has(v)))
}

function parseThirdParties(param: string | null): Set<string> {
  if (!param) return new Set<string>()
  return new Set(param.split(",").filter((v) => v.startsWith("did:")))
}

export function useFundingConfirmedBy(): FundingConfirmedByState {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const rolesParam = searchParams?.get("confirmedRoles") ?? null
  const roles = useMemo(() => parseRoles(rolesParam), [rolesParam])

  const tpParam = searchParams?.get("confirmedTp") ?? null
  const thirdParties = useMemo(() => parseThirdParties(tpParam), [tpParam])

  const isDefault = thirdParties.size === 0 && isDefaultConfirmRoleSet(roles)

  // Toggles read the URL as it is at click time and write it back with the
  // native History API, which Next keeps in sync with useSearchParams. Going
  // through the router instead lags a render behind, so a second click before
  // the first had landed toggled from stale state and undid the first.
  const update = useCallback(
    (patch: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(window.location.search)
      patch(params)
      const qs = params.toString()
      // State must be null: Next skips syncing a call whose state carries its
      // own internal marker, which the current history.state does.
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname],
  )

  const toggleRole = useCallback(
    (role: ConfirmRole) => {
      update((params) => {
        const next = parseRoles(params.get("confirmedRoles"))
        if (next.has(role)) next.delete(role)
        else next.add(role)
        if (isDefaultConfirmRoleSet(next)) params.delete("confirmedRoles") // the default ⇒ no param
        else
          params.set(
            "confirmedRoles",
            next.size === 0 ? EMPTY_SELECTION_SENTINEL : CONFIRM_ROLES.filter((r) => next.has(r)).join(","),
          )
      })
    },
    [update],
  )

  const toggleThirdParty = useCallback(
    (did: string) => {
      update((params) => {
        const next = parseThirdParties(params.get("confirmedTp"))
        if (next.has(did)) next.delete(did)
        else next.add(did)
        if (next.size === 0) params.delete("confirmedTp")
        else params.set("confirmedTp", Array.from(next).join(","))
      })
    },
    [update],
  )

  const reset = useCallback(() => {
    // Back to the default: trusted sources + both sides, no third parties.
    update((params) => {
      params.delete("confirmedRoles")
      params.delete("confirmedTp")
    })
  }, [update])

  return { roles, thirdParties, isDefault, toggleRole, toggleThirdParty, reset }
}
