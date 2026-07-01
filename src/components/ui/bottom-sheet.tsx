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

  // Self-contained Tailwind mirroring `.bottom-sheet*` in pages.css. The chrome
  // is gated behind `max-[799px]:` so the sheet stays `display:none` on desktop
  // (callers pair this with <AppDialog> for the desktop surface). The slide-up /
  // fade-in animations reference the global @keyframes still defined inside the
  // `@media (max-width:799px)` block in pages.css.
  const sheetBase =
    // `bottom-sheet` is kept as a JS hook (navbar.tsx click-outside guard uses
    // closest('.bottom-sheet, .bottom-sheet__backdrop')); styling is the Tailwind below.
    "bottom-sheet hidden max-[799px]:flex max-[799px]:flex-col max-[799px]:fixed max-[799px]:bottom-0 max-[799px]:left-0 max-[799px]:right-0 max-[799px]:max-h-[70vh] max-[799px]:bg-[var(--bg-elevated)] max-[799px]:rounded-t-[var(--radius)] max-[799px]:z-[71] max-[799px]:overflow-hidden max-[799px]:animate-[bottomSheetSlideUp_0.3s_ease-out] max-[799px]:transition-[max-height] max-[799px]:duration-300 max-[799px]:ease-out"
  // `.bottom-sheet--expanded` raises the cap to 92vh.
  const sheetExpandedClass = sheetExpanded ? " max-[799px]:max-h-[92vh]" : ""
  const sheetClassName = `${sheetBase}${sheetExpandedClass}${
    className ? ` ${className}` : ""
  }`

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
        className="bottom-sheet__backdrop hidden max-[799px]:block max-[799px]:fixed max-[799px]:inset-0 max-[799px]:bg-[var(--navy-overlay-30)] max-[799px]:z-[70] max-[799px]:animate-[bottomSheetFadeIn_0.2s_ease-out]"
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
          className="max-[799px]:flex max-[799px]:justify-center max-[799px]:pt-3.5 max-[799px]:pb-2.5 max-[799px]:flex-shrink-0 max-[799px]:cursor-grab max-[799px]:touch-none max-[799px]:after:content-[''] max-[799px]:after:w-9 max-[799px]:after:h-1 max-[799px]:after:bg-[var(--border-default)] max-[799px]:after:rounded-[var(--radius)]"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        />
        {resolvedHeader}
        <div className="max-[799px]:overflow-x-hidden max-[799px]:overflow-y-auto max-[799px]:[-webkit-overflow-scrolling:touch] max-[799px]:pb-[env(safe-area-inset-bottom,16px)]">
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}
