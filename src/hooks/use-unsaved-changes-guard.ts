"use client"

import { useCallback, useEffect } from "react"

/** The in-app question (asked in a `<ConfirmDialog>`, see
 *  `UnsavedChangesPrompt` in `view-transitions.tsx`). */
export const DISCARD_TITLE = "Discard your changes?"
export const DISCARD_MESSAGE =
  "You have unsaved changes on this page. They will be lost if you leave."
export const DISCARD_CONFIRM = "Discard changes"
export const DISCARD_CANCEL = "Keep editing"

/** The browser's own prompt, used only when no dialog host is mounted
 *  (outside the root layout). */
const NATIVE_PROMPT = "You have unsaved changes. Leave and discard them?"

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
 *  follows (a `router.back()` popstate, the link click replayed) isn't
 *  asked about a second time. Cleared when the guard that was dirty
 *  unmounts or goes clean. */
let leaveConfirmed = false

/** True while our own `history.go()` is moving the browser back to the
 *  form's entry; that popstate is swallowed too. */
let restoring = false

// ---------------------------------------------------------------------
// The question in flight, shown by the one mounted prompt host.
// ---------------------------------------------------------------------

let pending: ((leave: boolean) => void) | null = null
const listeners = new Set<() => void>()
let hosts = 0

function emit() {
  for (const listener of listeners) listener()
}

/** For the prompt host (`useSyncExternalStore`). */
export function subscribeLeavePrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** True while the "discard your changes?" question is open. */
export function isLeavePromptOpen(): boolean {
  return pending !== null
}

/** The viewer's answer, from the prompt host's buttons. */
export function answerLeavePrompt(leave: boolean): void {
  pending?.(leave)
}

/** The prompt host registers itself while mounted; without one the
 *  browser's own prompt asks instead. */
export function registerLeavePromptHost(): () => void {
  hosts += 1
  return () => {
    hosts -= 1
  }
}

/** Ask, then call `onAnswer` with the viewer's choice. */
function ask(onAnswer: (leave: boolean) => void): void {
  if (hosts === 0) {
    const leave = window.confirm(NATIVE_PROMPT)
    if (leave) leaveConfirmed = true
    onAnswer(leave)
    return
  }
  const answer = (leave: boolean) => {
    if (pending !== answer) return
    pending = null
    if (leave) leaveConfirmed = true
    emit()
    onAnswer(leave)
  }
  pending = answer
  emit()
}

/** True while any mounted form has unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return dirtyGuards.size > 0
}

/**
 * Run `proceed` once it's safe to navigate away: at once when nothing is
 * dirty (or leaving was already confirmed), otherwise after the viewer
 * confirms discarding their changes in the dialog. "Keep editing" does
 * nothing.
 */
export function confirmLeave(proceed: () => void): void {
  if (dirtyGuards.size === 0 || leaveConfirmed) {
    proceed()
    return
  }
  ask((leave) => {
    if (leave) proceed()
  })
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

/** Move the browser back to the form's entry, swallowing that popstate. */
function returnToForm(form: { index: number | null }) {
  const here = historyIndex()
  const delta = form.index !== null && here !== null ? form.index - here : 1
  if (delta !== 0) {
    restoring = true
    history.go(delta)
  }
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
  // Already asking (a second back while the dialog is open): just return
  // to the form; the open question still decides.
  if (pending) {
    returnToForm(form)
    return
  }
  ask((leave) => {
    if (!leave) {
      returnToForm(form)
      return
    }
    if (window.location.href === form.href) {
      // Back on the form's entry (a second back was undone meanwhile):
      // step back again, which now goes through.
      history.back()
      return
    }
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }))
  })
}

/** A link to this same page (a skip link, an in-page section): not a
 *  navigation away. */
function isSamePageLink(a: HTMLAnchorElement): boolean {
  if (a.getAttribute("href")?.startsWith("#")) return true
  try {
    const to = new URL(a.href, window.location.href)
    const here = new URL(window.location.href)
    return (
      to.origin === here.origin &&
      to.pathname === here.pathname &&
      to.search === here.search &&
      to.hash !== ""
    )
  } catch {
    return false
  }
}

/** Follow a link the viewer was asked about: replay the click (so a Next
 *  `<Link>` navigates in the app), or load it when it has gone. */
function followLink(a: HTMLAnchorElement) {
  if (a.isConnected) a.click()
  else window.location.assign(a.href)
}

export interface UnsavedChangesGuardOptions {
  /** Links inside elements matching this selector navigate without asking
   *  (the inline profile editor's own Save / Cancel bar). */
  ignoreLinksWithin?: string
}

/**
 * Warn before the viewer leaves a dirty form. Shared by the create / edit
 * routes, the update form and the inline profile edit:
 *   1. Browser refresh / tab close: native `beforeunload` (browsers allow
 *      no other prompt there).
 *   2. In-app navigation via any `<a href>` (top bar, sidebar, back link):
 *      an anchor-capture handler holds the click and asks in a
 *      `<ConfirmDialog>`; leaving replays the click.
 *   3. Browser / OS back and forward: `guardPopState`, added app-wide by
 *      `ViewTransitionProvider`, asks while a guard is dirty.
 *   4. The phone top bar's "Go back" (`transitionBack`) goes through
 *      `confirmLeave()` before navigating.
 * The App Router doesn't expose a stable navigation guard, so programmatic
 * Cancel handlers pass their navigation to the returned
 * `confirmDiscard(proceed)`.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  options: UnsavedChangesGuardOptions = {},
) {
  const { ignoreLinksWithin } = options
  useEffect(() => {
    if (!isDirty) return

    const token = Symbol("unsaved-changes")
    dirtyGuards.add(token)
    armed = { token, href: window.location.href, index: historyIndex() }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaveConfirmed) return
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
      if (target.hasAttribute("download")) return
      if (ignoreLinksWithin && target.closest(ignoreLinksWithin)) return
      if (isSamePageLink(target)) return
      if (leaveConfirmed) return

      e.preventDefault()
      e.stopImmediatePropagation()
      ask((leave) => {
        if (leave) followLink(target)
      })
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      dirtyGuards.delete(token)
      if (armed?.token === token) armed = null
      leaveConfirmed = false
      // Nothing left to lose: drop a question still open.
      if (dirtyGuards.size === 0 && pending) {
        pending = null
        emit()
      }
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [isDirty, ignoreLinksWithin])

  /** Run `proceed` when it's safe to navigate away: at once for a clean
   *  form, after the viewer confirms discarding their changes otherwise. */
  const confirmDiscard = useCallback(
    (proceed: () => void) => {
      if (!isDirty) proceed()
      else confirmLeave(proceed)
    },
    [isDirty],
  )

  return { confirmDiscard }
}
