"use client"

import React, { useEffect } from "react"
import { createPortal } from "react-dom"
import { useFocusTrap } from "@/hooks/use-focus-trap"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useMounted } from "@/hooks/use-mounted"

export interface DrawerProps {
  /** Whether the drawer is visible (slid in). */
  open: boolean
  /** Fired on backdrop click and Esc. */
  onClose: () => void
  /** Which edge the panel is anchored to + slides in from. Default "left". */
  side?: "left" | "right"
  /** Accessible label for the dialog, read aloud when it opens. */
  ariaLabel?: string
  children: React.ReactNode
}

/**
 * Edge-anchored panel — the side-drawer sibling of `BottomSheet`.
 *
 * Renders a portalled backdrop scrim + an `<aside role="dialog"
 * aria-modal>` pinned to the left or right edge, sliding in from that
 * side. Wires up every behaviour an overlay panel needs:
 *   - Esc-to-close
 *   - backdrop-click-to-close
 *   - focus trap scoped to the panel (via `useFocusTrap`)
 *   - body scroll lock while open (via `useBodyScrollLock`)
 *   - `inert` on the off-canvas panel while closed, so Tab can't reach
 *     its (invisible) controls
 *
 * The panel stays mounted while it slides off-canvas via a CSS
 * transform, so both the slide-in and slide-out animations play. The
 * slide is reduced-motion-safe (`motion-reduce:*`), and the global
 * `prefers-reduced-motion` block applies on top.
 *
 * Folds the bespoke mobile-sidebar + site-drawer shells into one
 * primitive; callers own the panel's inner content.
 */
export default function Drawer({
  open,
  onClose,
  side = "left",
  ariaLabel,
  children,
}: DrawerProps) {
  // Trap focus inside the panel while open. Tab/Shift+Tab cycle within
  // it and don't drift to background content behind the backdrop.
  const focusTrapRef = useFocusTrap<HTMLElement>(open)

  // Lock body scroll while the drawer is open.
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

  // Portal mount — gates SSR so `createPortal(document.body)` only runs
  // on the client (mirrors mobile-sidebar's `useMounted` gate).
  const mounted = useMounted()
  if (!mounted) return null

  // Anchor + off-canvas transform per side. The panel is always
  // rendered; `open` toggles between the on-screen and off-canvas
  // transform so the slide animation can play in both directions.
  const isLeft = side === "left"
  const anchorClass = isLeft ? "left-0" : "right-0"
  const closedTransform = open
    ? "translate-x-0"
    : isLeft
      ? "-translate-x-full"
      : "translate-x-full"

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-[var(--z-portal-sheet)] bg-[var(--navy-overlay-30)] transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // While closed the panel sits off-canvas but stays in the DOM
        // (so it can slide back in). `inert` makes the whole subtree
        // non-focusable + hidden from the a11y tree until it's open,
        // so Tab from background chrome can't land on its controls.
        inert={!open}
        // Same z-token as the backdrop; the panel follows it in DOM
        // order, so it stacks on top without needing a higher index
        // (mirrors the 60/61 split mobile-sidebar uses in raw CSS).
        className={`fixed top-0 bottom-0 ${anchorClass} z-[var(--z-portal-sheet)] flex w-[83.33%] max-w-[320px] flex-col overflow-y-auto bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)] transition-transform duration-300 ease-out motion-reduce:transition-none ${closedTransform}`}
      >
        {children}
      </aside>
    </>,
    document.body,
  )
}
