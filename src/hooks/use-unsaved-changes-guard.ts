"use client"

import { useCallback, useEffect } from "react"

const DISCARD_PROMPT = "You have unsaved changes. Leave and discard them?"

/**
 * Warn before the viewer leaves a dirty form. Same guard the inline profile
 * edit uses (`use-profile-inline-edit.ts`), shared by the create / edit
 * routes:
 *   1. Browser refresh / tab close — native `beforeunload`.
 *   2. In-app navigation via any `<a href>` (top bar, sidebar, back link)
 *      — anchor-capture handler that pops `window.confirm()`.
 * The App Router doesn't expose a stable navigation guard, so programmatic
 * Cancel handlers call the returned `confirmDiscard()` before navigating.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }

    const onClickCapture = (e: MouseEvent) => {
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return
      }
      const target =
        e.target instanceof Element
          ? (e.target.closest("a[href]") as HTMLAnchorElement | null)
          : null
      if (!target) return
      if (target.target && target.target !== "_self") return

      if (!window.confirm(DISCARD_PROMPT)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [isDirty])

  /** True when it's safe to navigate away (clean form, or the viewer
   *  confirmed discarding their changes). */
  const confirmDiscard = useCallback(
    () => !isDirty || window.confirm(DISCARD_PROMPT),
    [isDirty],
  )

  return { confirmDiscard }
}
