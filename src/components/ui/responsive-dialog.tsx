"use client"

import { type ReactNode, type RefObject } from "react"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import AppDialog from "./app-dialog"
import BottomSheet from "./bottom-sheet"

/**
 * Responsive modal shell (DESIGN §14.6): renders an `<AppDialog>` at the
 * desktop breakpoint (≥800px) and a `<BottomSheet>` below it (<800px),
 * behind a single children / header / onClose surface so consumers like
 * `FeedbackModal` don't have to branch on viewport themselves.
 *
 * The desktop/mobile split is driven by `useLayoutBreakpoints().isDesktop`,
 * which is SSR-safe: `window` is only read inside its mount effect, so the
 * server (and first client render) treat the viewport as mobile and the
 * post-mount tick reconciles against the real width. The 800px boundary
 * matches the `--bp-gt-mobile` token and `BottomSheet`'s own CSS gate
 * (`.bottom-sheet` is `display: none` at desktop widths), so the two render
 * paths never overlap.
 *
 * Unlike `AppDialog` — which is mount-gated by its consumer — this shell
 * takes an `open` prop and gates the whole thing internally, mirroring
 * `BottomSheet`'s API. When `open` is false nothing mounts (no `<dialog>`,
 * no portal), so the underlying focusable content never exists at rest.
 */

export interface ResponsiveDialogProps {
  /** Whether the modal is mounted + visible. Both paths unmount when false. */
  open: boolean
  /** Fired on Esc, backdrop click, the close button, and (mobile only)
   *  drag-to-dismiss. Wire it the same way for both breakpoints. */
  onClose: () => void
  /** Accessible label, required for screen readers. Used directly as the
   *  desktop dialog's `aria-label`; on mobile it labels the sheet unless a
   *  string `title` is supplied to `BottomSheet`. */
  ariaLabel: string
  /** Optional header row rendered above the content. The same node is used
   *  for both breakpoints — pass an `<AppDialogHeader>` (or any node with
   *  its own close affordance). Owns its own close button. */
  header?: ReactNode
  /** Extra class(es). Appended to the desktop dialog chrome and to the
   *  mobile sheet container respectively. */
  className?: string
  /** Desktop-only: inline max-width cap for the `<AppDialog>`. Ignored on
   *  the mobile sheet, which is full-width by design. */
  maxWidth?: number | string
  /** Desktop-only: when true, `<AppDialog>` ignores backdrop clicks. The
   *  mobile sheet has no equivalent; suppress its dismissal via `onClose`. */
  disableBackdropClose?: boolean
  /** Desktop-only: focus the first focusable element (or `initialFocusRef`)
   *  on open. The mobile sheet runs its own focus trap. */
  autoFocusFirst?: boolean
  /** Desktop-only: element to focus on open instead of the first focusable
   *  child. Only consulted when `autoFocusFirst` is true. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Desktop-only: `<AppDialog>`'s ARIA role. */
  role?: "dialog" | "alertdialog"
  children: ReactNode
}

export default function ResponsiveDialog({
  open,
  onClose,
  ariaLabel,
  header,
  className,
  maxWidth,
  disableBackdropClose = false,
  autoFocusFirst = false,
  initialFocusRef,
  role = "dialog",
  children,
}: ResponsiveDialogProps) {
  const { isDesktop } = useLayoutBreakpoints()

  // Below 800px: bottom sheet. It owns its own `open` gate, portal, focus
  // trap, body-scroll lock, and Esc handling.
  if (!isDesktop) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        ariaLabel={ariaLabel}
        header={header}
        className={className}
      >
        {children}
      </BottomSheet>
    )
  }

  // Desktop: `<AppDialog>` has no `open` prop — it calls `showModal()` on
  // mount — so gate the mount here to match the sheet's behaviour.
  if (!open) return null

  return (
    <AppDialog
      ariaLabel={ariaLabel}
      role={role}
      className={className}
      maxWidth={maxWidth}
      onClose={onClose}
      disableBackdropClose={disableBackdropClose}
      autoFocusFirst={autoFocusFirst}
      initialFocusRef={initialFocusRef}
    >
      {header}
      {children}
    </AppDialog>
  )
}
