"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { ManagedIdentity } from "./use-managed-authors"

/**
 * Shared "focus by managed identity" filter logic for the surfaces that
 * aggregate records across the viewer's personal account + the groups
 * they own/admin (the /managed hub and the notifications page).
 *
 * The selection lives in a query param (default `?focus=`) so a refresh
 * or shared link keeps the view. "Everything" is the bare default and is
 * omitted from the URL; "You" selects the personal identity; any other
 * value is a group DID. An unknown value (e.g. a stale group DID after
 * losing admin) collapses back to Everything rather than stranding the
 * user on an empty, inescapable list.
 */

export const FOCUS_EVERYTHING = "everything"
export const FOCUS_YOU = "you"

// Above this many identities a segmented strip would overflow the reading
// column, so callers fall back to a dropdown.
export const SEGMENTED_MAX_IDENTITIES = 5

export interface IdentityFocus {
  /** Current focus value: FOCUS_EVERYTHING, FOCUS_YOU, or a group DID. */
  focus: string
  setFocus: (next: string) => void
  /** The DID the focus scopes to; null means Everything (no filter). */
  focusedDid: string | null
  /** True when a single GROUP is focused — suppress the per-row "via". */
  singleGroupFocused: boolean
  /** [Everything, You, ...each group] for the control. */
  filterOptions: { value: string; label: string }[]
  /** Render a dropdown (many identities) instead of a segmented strip. */
  useDropdown: boolean
}

export function useIdentityFocus(
  identities: ManagedIdentity[],
  paramName = "focus",
): IdentityFocus {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const focus = useMemo<string>(() => {
    const raw = searchParams?.get(paramName)
    if (!raw || raw === FOCUS_EVERYTHING) return FOCUS_EVERYTHING
    if (raw === FOCUS_YOU) return FOCUS_YOU
    return identities.some((i) => i.did === raw) ? raw : FOCUS_EVERYTHING
  }, [searchParams, identities, paramName])

  const setFocus = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next === FOCUS_EVERYTHING) params.delete(paramName)
      else params.set(paramName, next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, paramName],
  )

  const focusedDid = useMemo<string | null>(() => {
    if (focus === FOCUS_EVERYTHING) return null
    if (focus === FOCUS_YOU) {
      return identities.find((i) => i.kind === "personal")?.did ?? null
    }
    return focus
  }, [focus, identities])

  const singleGroupFocused = useMemo<boolean>(() => {
    if (focus === FOCUS_EVERYTHING || focus === FOCUS_YOU) return false
    return identities.some((i) => i.did === focus && i.kind === "group")
  }, [focus, identities])

  const filterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: FOCUS_EVERYTHING, label: "Everything" },
    ]
    for (const identity of identities) {
      if (identity.kind === "personal") {
        opts.push({ value: FOCUS_YOU, label: identity.label })
      } else {
        opts.push({ value: identity.did, label: identity.label })
      }
    }
    return opts
  }, [identities])

  // `identities` always includes the personal account, so the option
  // count is identities.length + 1 (the Everything option).
  const useDropdown = identities.length > SEGMENTED_MAX_IDENTITIES

  return {
    focus,
    setFocus,
    focusedDid,
    singleGroupFocused,
    filterOptions,
    useDropdown,
  }
}
