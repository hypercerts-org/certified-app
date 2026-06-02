"use client"

import { useEffect, useRef, useCallback, type RefObject, type ReactNode, type MouseEvent } from "react"
import { X } from "lucide-react"

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

/**
 * Standard modal header — title on the left, close X on the right.
 * Drop-in replacement for the open-coded
 * `<div className="signin-modal__header">…<button signin-modal__close>…</button></div>`
 * pattern repeated across ~14 modals in `src/components/**`.
 *
 * Pass `onClose` — usually the same handler the parent passes to
 * `AppDialog`'s `onClose` prop — and `disabled` to gate the X
 * during in-flight operations.
 */
export function AppDialogHeader({
  title,
  onClose,
  disabled = false,
}: {
  title: ReactNode
  /** When omitted the X button is hidden. Use for alertdialog
   *  modals where the only exits are explicit footer buttons. */
  onClose?: () => void
  disabled?: boolean
}) {
  return (
    <div className="signin-modal__header">
      <span className="signin-modal__title">{title}</span>
      {onClose ? (
        <button
          type="button"
          className="signin-modal__close"
          onClick={onClose}
          aria-label="Close"
          disabled={disabled}
        >
          <X size={18} />
        </button>
      ) : null}
    </div>
  )
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
  // Stash the latest onClose in a ref so the mount effect's listener
  // always calls the current value WITHOUT having to re-run (which
  // would re-call `showModal()` on an already-open dialog and throw
  // `InvalidStateError`, unmounting the modal mid-task).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // Save the previously-focused element so we can restore focus
    // when the dialog closes. A11y: keyboard users should land back
    // on the trigger that opened the modal, not on `<body>`.
    // (Round-2 a11y finding A-2 — partial fix; a full Tab-cycle
    // focus trap remains deferred to round 3.)
    const previouslyFocused =
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    // Defence-in-depth: the original InvalidStateError was caused by
    // `showModal()` being called on an already-open dialog (effect
    // re-running because `onClose` was in deps). The ref pattern
    // above is the real fix; this guard + try/catch keeps a future
    // regression from unmounting the modal mid-task again. Any
    // browsers that throw for a non-spec reason also fall through
    // silently rather than tearing down the consumer.
    if (!dialog.open) {
      try {
        dialog.showModal()
      } catch {
        // swallow — modal stays closed but the rest of the app
        // keeps running.
      }
    }
    const handleClose = () => onCloseRef.current()
    dialog.addEventListener("close", handleClose)
    return () => {
      dialog.removeEventListener("close", handleClose)
      // Restore focus to whichever element had it before the modal
      // opened. Guard against the previous element being torn out
      // of the DOM (e.g. on a route navigation that closes the
      // dialog as a side effect).
      if (previouslyFocused && previouslyFocused.isConnected) {
        try {
          previouslyFocused.focus()
        } catch {
          // swallow — focus restoration is best-effort.
        }
      }
    }
    // Mount-once: no dep on `onClose`. The listener reads the latest
    // value via the ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDialogElement>) => {
      if (disableBackdropClose) return
      if (e.target === dialogRef.current) onCloseRef.current()
    },
    [disableBackdropClose],
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
