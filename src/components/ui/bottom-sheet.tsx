"use client"

import React, { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useBottomSheetDrag } from "@/hooks/use-bottom-sheet-drag"
import { useFocusTrap } from "@/hooks/use-focus-trap"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"

export interface BottomSheetProps {
  /** Whether the sheet is mounted + visible. */
  open: boolean
  /** Fired on backdrop click, Esc, the close button, and drag-to-dismiss. */
  onClose: () => void
  /** Accessible label for the dialog. Required when no `title` is given;
   *  if `title` is set it doubles as the label. */
  ariaLabel?: string
  /** Optional title. When set, a header row (title + close button) renders
   *  above the content and the title labels the dialog. */
  title?: React.ReactNode
  /** Optional custom header. Overrides the default `title` header entirely —
   *  the caller owns the close affordance in that case. */
  header?: React.ReactNode
  /** Extra class(es) appended to the sheet container. */
  className?: string
  children: React.ReactNode
}

/**
 * Mobile bottom sheet: a portalled shell over `useBottomSheetDrag`.
 *
 * Renders a backdrop scrim + a bottom-anchored sheet with a drag handle.
 * Wires up the behaviours every sheet needs:
 *   - drag-to-dismiss / drag-to-expand (via `useBottomSheetDrag`)
 *   - Esc-to-close
 *   - focus trap scoped to the sheet (via `useFocusTrap`)
 *   - body scroll lock while open (via `useBodyScrollLock`)
 *
 * Visual chrome (2px top-corner radius, slide-up animation, dark-mode
 * surfaces, reduced-motion handling) lives in `.bottom-sheet*` CSS in
 * `pages.css`, matching the existing profile-switcher / feedback sheets.
 *
 * Only mounts below 800px — the `.bottom-sheet` base class is
 * `display: none` at desktop widths, so callers that also need a desktop
 * presentation should pair this with `<AppDialog>`.
 */
export default function BottomSheet({
  open,
  onClose,
  ariaLabel,
  title,
  header,
  className = "",
  children,
}: BottomSheetProps) {
  const {
    sheetRef,
    sheetExpanded,
    onHandleTouchStart,
    onHandleTouchMove,
    onHandleTouchEnd,
  } = useBottomSheetDrag({ isOpen: open, onClose })

  // Trap focus inside the sheet while open, using the drag hook's `sheetRef`
  // as the trap container (both refs point at the same sheet element).
  useFocusTrap<HTMLDivElement>(open, sheetRef)

  // Lock body scroll while the sheet is open.
  useBodyScrollLock(open)

  // Esc-to-close.
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  if (!open) return null
  // Portal targets document.body, which is undefined during SSR.
  if (typeof document === "undefined") return null

  const sheetClassName = `bottom-sheet${
    sheetExpanded ? " bottom-sheet--expanded" : ""
  }${className ? ` ${className}` : ""}`

  // Default header: title on the left, close X on the right. Only rendered
  // when a custom `header` is not supplied and a `title` exists.
  const resolvedHeader =
    header ??
    (title ? (
      <div className="flex items-center justify-between px-5 pb-3">
        <span className="font-headline text-h4 text-[var(--fg-primary)]">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 motion-reduce:transition-none"
        >
          <X size={18} />
        </button>
      </div>
    ) : null)

  return createPortal(
    <>
      <div
        className="bottom-sheet__backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={sheetClassName}
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title && typeof title === "string" ? title : ariaLabel}
      >
        <div
          className="bottom-sheet__handle"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        />
        {resolvedHeader}
        <div className="bottom-sheet__content">{children}</div>
      </div>
    </>,
    document.body,
  )
}
