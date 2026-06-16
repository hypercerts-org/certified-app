"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CONFIRM_ROLES, type ConfirmRole } from "@/lib/atproto/funding-provenance"

/** Sentinel for an "explicitly empty" selection in a URL param whose absence
 *  means "default" — mirrors the /explore degree + quality filters, so an
 *  empty role set survives a reload instead of snapping back to all-three. */
const EMPTY_SELECTION_SENTINEL = "-"

export interface FundingConfirmedByState {
  /** Selected role buckets (default: all of `CONFIRM_ROLES`). */
  roles: Set<ConfirmRole>
  /** Selected third-party attestor DIDs (default: none). */
  thirdParties: Set<string>
  /** True when the selection equals the default (all roles, no third parties). */
  isDefault: boolean
  toggleRole: (role: ConfirmRole) => void
  toggleThirdParty: (did: string) => void
  reset: () => void
}

/**
 * URL-backed state for the Funding "Confirmed by" filter, shared by /explore
 * and the activity detail page so both surfaces behave identically. Two axes
 * whose UNION is shown: the Both / Sender / Recipient role buckets
 * (`?confirmedRoles=`, default all three) and a set of specific third-party
 * attestor DIDs (`?confirmedTp=`, default none). Filtering itself is
 * client-side via {@link matchesConfirmedBy} — the role buckets aren't a
 * single indexer arg. Only the params this filter owns are touched; every
 * other query param (tab, sort, …) is preserved.
 */
export function useFundingConfirmedBy(): FundingConfirmedByState {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const rolesParam = searchParams?.get("confirmedRoles") ?? null
  const roles = useMemo<Set<ConfirmRole>>(() => {
    if (rolesParam == null) return new Set(CONFIRM_ROLES)
    if (rolesParam === EMPTY_SELECTION_SENTINEL) return new Set()
    const valid = new Set<string>(CONFIRM_ROLES)
    return new Set(
      rolesParam.split(",").filter((v): v is ConfirmRole => valid.has(v)),
    )
  }, [rolesParam])

  const tpParam = searchParams?.get("confirmedTp") ?? null
  const thirdParties = useMemo<Set<string>>(() => {
    if (!tpParam) return new Set<string>()
    return new Set(tpParam.split(",").filter((v) => v.startsWith("did:")))
  }, [tpParam])

  const isDefault =
    thirdParties.size === 0 && roles.size === CONFIRM_ROLES.length

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, searchParams, router],
  )

  const toggleRole = useCallback(
    (role: ConfirmRole) => {
      const next = new Set(roles)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      const value =
        next.size === CONFIRM_ROLES.length
          ? null // all three = default ⇒ clear the param
          : next.size === 0
            ? EMPTY_SELECTION_SENTINEL
            : CONFIRM_ROLES.filter((r) => next.has(r)).join(",")
      setParam({ confirmedRoles: value })
    },
    [roles, setParam],
  )

  const toggleThirdParty = useCallback(
    (did: string) => {
      const next = new Set(thirdParties)
      if (next.has(did)) next.delete(did)
      else next.add(did)
      setParam({
        confirmedTp: next.size === 0 ? null : Array.from(next).join(","),
      })
    },
    [thirdParties, setParam],
  )

  const reset = useCallback(() => {
    // Back to the default: all role buckets, no third parties.
    setParam({ confirmedRoles: null, confirmedTp: null })
  }, [setParam])

  return { roles, thirdParties, isDefault, toggleRole, toggleThirdParty, reset }
}
