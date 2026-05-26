"use client"

import { useEffect, type RefObject } from "react"

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
  useEffect(() => {
    if (!open) return
    const handleDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open, ref, onClose])
}
