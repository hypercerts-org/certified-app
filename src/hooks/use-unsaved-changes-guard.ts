"use client"

import { useCallback, useEffect } from "react"

const DISCARD_PROMPT = "You have unsaved changes. Leave and discard them?"

/**
 * App-wide record of mounted guards whose form is dirty, so navigation
 * that doesn't go through an `<a href>` (the phone top bar's "Go back",
 * which calls `transitionBack()` in `view-transitions.tsx`, and the
 * browser's back and forward) can ask first. Module-level rather than
 * context: the top bar and the form live in different subtrees, and only
 * one form is mounted at a time in practice.
 */
const dirtyGuards = new Set<symbol>()

/** The latest dirty form's history entry (its URL, and its index where
 *  the Navigation API exists), so "stay" can return the browser to it. */
let armed: { token: symbol; href: string; index: number | null } | null = null

/** Set once the viewer has confirmed leaving, so the navigation that
 *  follows (a `router.back()` popstate) isn't asked about a second time.
 *  Cleared when the guard that was dirty unmounts or goes clean. */
let leaveConfirmed = false

/** True while our own `history.go()` is moving the browser back to the
 *  form's entry; that popstate is swallowed too. */
let restoring = false

/** True while any mounted form has unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return dirtyGuards.size > 0
}

/**
 * Ask before a programmatic navigation away from a dirty form. Returns
 * true when it's safe to go (nothing dirty, or the viewer confirmed
 * discarding). The same prompt the in-page links use.
 */
export function confirmLeaveUnsavedChanges(): boolean {
  if (dirtyGuards.size === 0 || leaveConfirmed) return true
  if (!window.confirm(DISCARD_PROMPT)) return false
  leaveConfirmed = true
  return true
}

/** `navigation.currentEntry.index` where the Navigation API exists. */
function historyIndex(): number | null {
  const nav = (
    window as Window & {
      navigation?: { currentEntry?: { index: number } | null }
    }
  ).navigation
  const index = nav?.currentEntry?.index
  return typeof index === "number" && index >= 0 ? index : null
}

/**
 * The browser / OS back and forward buttons while a form is dirty. By the
 * time `popstate` fires the browser has already moved to the other entry,
 * so this holds the App Router back (`stopImmediatePropagation`) and asks:
 *   - leave: replay the event, so the router renders the entry the
 *     browser moved to;
 *   - stay: move the browser back to the form's entry, swallowing that
 *     popstate too, so the router never sees either step.
 * It must run before the App Router's own popstate listener. Chrome calls
 * a window's listeners in the order they were added (capture or not), so
 * `ViewTransitionProvider` adds this one when the root layout mounts,
 * before the App Router adds its own (a parent's effects run after its
 * children's); the capture flag covers browsers that call capture
 * listeners first.
 */
export function guardPopState(e: PopStateEvent) {
  if (restoring) {
    restoring = false
    e.stopImmediatePropagation()
    return
  }
  const form = armed
  if (!form || leaveConfirmed) return
  if (window.location.href === form.href) return

  e.stopImmediatePropagation()
  if (window.confirm(DISCARD_PROMPT)) {
    leaveConfirmed = true
    window.dispatchEvent(new PopStateEvent("popstate", { state: e.state }))
    return
  }
  const here = historyIndex()
  const delta = form.index !== null && here !== null ? form.index - here : 1
  if (delta !== 0) {
    restoring = true
    history.go(delta)
  }
}

/**
 * Warn before the viewer leaves a dirty form. Same guard the inline profile
 * edit uses (`use-profile-inline-edit.ts`), shared by the create / edit
 * routes:
 *   1. Browser refresh / tab close: native `beforeunload`.
 *   2. In-app navigation via any `<a href>` (top bar, sidebar, back link):
 *      anchor-capture handler that pops `window.confirm()`.
 *   3. Browser / OS back and forward: `guardPopState`, added app-wide by
 *      `ViewTransitionProvider`, asks while a guard is dirty.
 *   4. The phone top bar's "Go back" (`transitionBack`) checks
 *      `confirmLeaveUnsavedChanges()` before navigating.
 * The App Router doesn't expose a stable navigation guard, so programmatic
 * Cancel handlers call the returned `confirmDiscard()` before navigating.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return

    const token = Symbol("unsaved-changes")
    dirtyGuards.add(token)
    armed = { token, href: window.location.href, index: historyIndex() }

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
      if (leaveConfirmed) return

      if (!window.confirm(DISCARD_PROMPT)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      dirtyGuards.delete(token)
      if (armed?.token === token) armed = null
      leaveConfirmed = false
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [isDirty])

  /** True when it's safe to navigate away (clean form, or the viewer
   *  confirmed discarding their changes). */
  const confirmDiscard = useCallback(
    () => !isDirty || confirmLeaveUnsavedChanges(),
    [isDirty],
  )

  return { confirmDiscard }
}
