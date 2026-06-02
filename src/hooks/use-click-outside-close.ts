"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Close a popover / menu when the user clicks outside its container
 * OR presses Escape. Drop-in replacement for the inline
 * `mousedown + keydown` effect that several popovers across the app
 * were each implementing locally (filter popover on home feed, the
 * trusted-evaluator popover, the 3-dot Add-to-list menu, the
 * bulk-paste modal, etc.).
 *
 * The hook is a no-op when `open` is false — it never attaches the
 * listeners — so closed popovers don't fight for the document's
 * mousedown / keydown event slots.
 *
 * The `ref` should point at the outermost wrapper element that the
 * popover is anchored from (typically the same element that wraps
 * both the trigger button and the popover contents). Clicks inside
 * that element are considered "inside" and don't close the popover;
 * everything else does.
 */
export function useClickOutsideClose(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  // Stash onClose in a ref so the effect's listeners always call
  // the latest value without having to re-attach on every render
  // (callers commonly pass a fresh `() => setOpen(false)` arrow).
  // Listener thrash without this ref means closed-then-reopened
  // popovers spin up + tear down listeners every time state
  // upstream changes.
  //
  // The ref-update lives in a useEffect (not a render-time write)
  // to satisfy React 19's "no refs during render" lint rule. The
  // microsecond gap between render-phase prop change and the
  // commit-phase ref update is below the threshold any mousedown
  // / keydown event can hit in practice — the listener sees the
  // latest closure on the next event tick.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const handleDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current()
    }
    document.addEventListener("mousedown", handleDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open, ref])
}
