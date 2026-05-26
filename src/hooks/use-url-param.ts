"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

interface UseUrlParamOptions {
  /** Value to fall back to when the param is missing. The setter
   *  also drops the param from the URL when the new value equals
   *  this default — keeps the URL short for the common case. */
  defaultValue?: string | null
  /** How the setter updates history.
   *  - `"replace"` (default): `router.replace` — the URL changes
   *    without adding a back-button entry. Right for filter /
   *    sub-tab toggles where the previous state isn't a meaningful
   *    "page" the viewer wants to return to.
   *  - `"push"`: `router.push` — adds a history entry. Right when
   *    the new state IS a meaningful page (e.g. opening a list
   *    detail), so back-button restores the previous state. */
  mode?: "push" | "replace"
}

/**
 * URL-search-param state hook. Returns `[value, setValue]` where
 * `value` is the current `?<key>=...` string (or the default) and
 * `setValue(next, modeOverride?)` writes it back via the Next.js
 * router.
 *
 * Centralises the parse / patch / drop-default / scroll: false
 * boilerplate that every URL-driven state across the explore page,
 * the profile sub-tabs, and the lists tab was re-implementing.
 * Behaviour matches the prior inline patterns exactly:
 *
 *   - `setValue(v)` writes `?<key>=v` and removes other unrelated
 *     params untouched
 *   - `setValue(default)` (or null when no default) drops the
 *     param entirely so the URL stays short for the common case
 *   - `{ scroll: false }` is always passed so toggling filters
 *     doesn't yank the viewer back to the top of the page
 *
 * Per-call mode override (`setValue(v, "push")`) lets the caller
 * promote a transition that's usually a `replace` into a back-
 * able navigation (e.g. opening a list detail from the section
 * view).
 */
export function useUrlParam(
  key: string,
  options: UseUrlParamOptions = {},
): [string | null, (next: string | null, mode?: "push" | "replace") => void] {
  const { defaultValue = null, mode: defaultMode = "replace" } = options
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const raw = searchParams?.get(key)
  const value = raw === null || raw === undefined ? defaultValue : raw

  const setValue = useCallback(
    (next: string | null, modeOverride?: "push" | "replace") => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      // Drop the param when the new value equals the default —
      // keeps shared URLs short and the back-button history clean.
      // `null` always drops. Empty string is only treated as "drop"
      // when the default is also nullish; otherwise `""` is a
      // meaningful "show nothing" sentinel (e.g. `?quality=` on
      // the explore page intentionally serializes the empty set
      // distinctly from missing-param).
      const treatEmptyAsDrop = defaultValue === null || defaultValue === undefined
      if (
        next === null ||
        (next === "" && treatEmptyAsDrop) ||
        next === defaultValue
      ) {
        params.delete(key)
      } else {
        params.set(key, next)
      }
      const qs = params.toString()
      const target = qs ? `${pathname}?${qs}` : (pathname ?? "")
      const m = modeOverride ?? defaultMode
      if (m === "push") {
        router.push(target, { scroll: false })
      } else {
        router.replace(target, { scroll: false })
      }
    },
    [defaultMode, defaultValue, key, pathname, router, searchParams],
  )

  return [value, setValue]
}
