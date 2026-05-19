"use client"

import { useEffect, useRef, useCallback, type RefObject, type ReactNode, type MouseEvent } from "react"

/**
 * Shared chrome around `<dialog>` for every modal in the app.
 *
 * Every modal in `src/components/**` follows the same dance:
 *   - `useRef<HTMLDialogElement>`
 *   - `useEffect` to call `showModal()` on mount + wire up a `close`
 *     listener that fires `onCancel`
 *   - A backdrop-click handler that closes when the click hits the
 *     `<dialog>` itself (not its contents)
 *   - An inner `<div onClick={stopPropagation}>` wrapper so clicks
 *     inside don't bubble to the backdrop handler
 *   - The "signin-modal app-modal" class pair so the modal inherits
 *     the design-system chrome (border-radius, backdrop, dark-mode
 *     treatment, etc.)
 *
 * This component centralizes that skeleton. Each modal just provides
 * header + body + actions and the AppDialog handles the rest.
 *
 * Backdrop-close can be suppressed while a save is in flight via
 * `disableBackdropClose` — used by the social-graph sync modal so
 * closing mid-import doesn't bypass the abort path.
 */

export interface AppDialogProps {
  /** Required for screen readers — read aloud when the dialog opens. */
  ariaLabel: string
  /** "dialog" for general dialogs; "alertdialog" for destructive
   *  confirmations that block until acted on. */
  role?: "dialog" | "alertdialog"
  /** Extra class(es) appended to the base "signin-modal app-modal"
   *  pair. Optional. */
  className?: string
  /** Inline max-width when the modal needs a tighter cap than the
   *  default. */
  maxWidth?: number | string
  /** Fired on `<dialog>.close` events AND on backdrop clicks (unless
   *  disableBackdropClose is true). Esc key triggers this via the
   *  browser's native dialog `close` event. */
  onClose: () => void
  /** When true, backdrop clicks are ignored. Esc + the native
   *  `close` event still fire — callers that want to suppress those
   *  too should handle this in their own state. */
  disableBackdropClose?: boolean
  /** Optional ref for the inner content wrapper. */
  contentRef?: RefObject<HTMLDivElement | null>
  children: ReactNode
}

export default function AppDialog({
  ariaLabel,
  role = "dialog",
  className,
  maxWidth,
  onClose,
  disableBackdropClose = false,
  contentRef,
  children,
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    const handleClose = () => onClose()
    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onClose])

  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDialogElement>) => {
      if (disableBackdropClose) return
      if (e.target === dialogRef.current) onClose()
    },
    [onClose, disableBackdropClose],
  )

  const composedClassName = className
    ? `signin-modal app-modal ${className}`
    : "signin-modal app-modal"

  const style = maxWidth !== undefined ? { maxWidth } : undefined

  return (
    <dialog
      ref={dialogRef}
      className={composedClassName}
      role={role}
      aria-label={ariaLabel}
      onClick={handleBackdropClick}
      style={style}
    >
      <div ref={contentRef} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </dialog>
  )
}
