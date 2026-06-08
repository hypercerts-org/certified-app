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
 *   - The design-system modal chrome (border-radius, surface, backdrop,
 *     dark-mode treatment, etc.) — now expressed inline as self-contained
 *     Tailwind utilities + token arbitrary values rather than the legacy
 *     "signin-modal app-modal" BEM pair. The translation is at strict
 *     visual parity with the resolved components.css + landing.css cascade
 *     (landing.css is imported later, so it wins on equal specificity;
 *     the `dialog.signin-modal.app-modal` selectors in components.css are
 *     higher-specificity and win for radius / padding / position).
 *
 * This component centralizes that skeleton. Each modal just provides
 * header + body + actions and the AppDialog handles the rest.
 *
 * Per-layer Escape: each AppDialog renders its own native modal
 * `<dialog>` opened via `showModal()`, so it joins the browser's
 * top-layer stack. Escape is dispatched by the UA to the TOPMOST
 * modal dialog only, which fires that dialog's native `cancel` +
 * `close` events — handled here by the `close` listener → `onClose`.
 * Nested AppDialogs therefore each scope their own Escape natively;
 * there is no custom keydown Escape handler to leak across layers.
 * (The component's only keydown handler is the Tab focus-trap.)
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
  /** Extra class(es) appended to the modal's self-contained Tailwind
   *  chrome. Optional. */
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
  /** When true, focus the first focusable element on open (or
   *  `initialFocusRef` if provided). Lets consumers drop their own
   *  `useEffect(() => ref.current?.focus(), [])` boilerplate. */
  autoFocusFirst?: boolean
  /** Optional element to focus on open instead of the first focusable
   *  child. Only consulted when `autoFocusFirst` is true. */
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * Selector matching the focusable elements we cycle through for the
 * Tab trap. Mirrors the common "tabbable" set; `[tabindex='-1']` is
 * excluded so programmatically-focusable-only nodes don't trap Tab.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

/**
 * Collect the visible, focusable descendants of `root` in DOM order.
 * Elements hidden via `display:none` (offsetParent === null) are
 * filtered out so Tab doesn't land on a collapsed section. The
 * `hidden` attribute and `disabled` are already excluded by the
 * selector / offsetParent check.
 */
function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.hasAttribute("hidden") &&
      el.getAttribute("aria-hidden") !== "true" &&
      // offsetParent is null for display:none nodes (and fixed nodes,
      // but dialogs aren't position:fixed children here). Cheap enough
      // for the handful of controls a modal holds.
      (el.offsetParent !== null || el.getClientRects().length > 0),
  )
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
    <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--color-light-gray)] pl-6 pr-10 pt-5 pb-3">
      <span className="flex-1 text-[0.8125rem] font-semibold tracking-[0.02em] text-[var(--fg-primary)]">
        {title}
      </span>
      {onClose ? (
        <button
          type="button"
          className="absolute right-1 top-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius)] border-0 bg-transparent p-0 text-[var(--fg-muted)] transition-[background,color] duration-150 ease-out hover:bg-[var(--bg-sunken)] hover:text-[var(--fg-primary)] focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

/**
 * Standard modal body — the scrolling content region beneath the
 * header. Self-contained Tailwind translation of the legacy
 * `signin-modal__body` class as it resolves inside the app-modal
 * cascade (`dialog.signin-modal.app-modal .signin-modal__body`, the
 * highest-specificity rule, sets `padding: 0 20px 20px`). The
 * `<dialog>` shell owns the scroll (`overflow-y: auto` + capped
 * max-height), so the body itself carries no overflow — it is purely
 * the padded content slot.
 *
 * Drop-in replacement for the hand-written
 * `<div className="signin-modal__body">…</div>` repeated across the
 * modals in `src/components/**`. Re-exported by the `ui` barrel via
 * its existing `export * from "./app-dialog"`.
 */
export function AppDialogBody({
  className,
  children,
}: {
  /** Extra class(es) appended to the body's padding. Optional. */
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className ? `px-5 pb-5 pt-0 ${className}` : "px-5 pb-5 pt-0"}>
      {children}
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
  autoFocusFirst = false,
  initialFocusRef,
  children,
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Stash the latest onClose in a ref so the mount effect's listener
  // always calls the current value WITHOUT having to re-run (which
  // would re-call `showModal()` on an already-open dialog and throw
  // `InvalidStateError`, unmounting the modal mid-task).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Stash the auto-focus props in refs so the mount-once effect below
  // reads their latest values without taking them as deps (which would
  // re-run the effect and re-call `showModal()` → InvalidStateError).
  const autoFocusFirstRef = useRef(autoFocusFirst)
  autoFocusFirstRef.current = autoFocusFirst
  const initialFocusRef_ = useRef(initialFocusRef)
  initialFocusRef_.current = initialFocusRef

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // Save the previously-focused element so we can restore focus
    // when the dialog closes. A11y: keyboard users should land back
    // on the trigger that opened the modal, not on `<body>`.
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

    // Tab-cycle focus trap. The native modal `<dialog>` already
    // confines Tab to its subtree in spec-compliant browsers, but it
    // does NOT wrap at the ends — Tab past the last focusable lands on
    // the browser chrome. Handle Tab ourselves so the focus order is a
    // closed loop scoped to the dialog (round-3 a11y finding A-2).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const focusable = getFocusable(dialog)
      if (focusable.length === 0) {
        // Nothing focusable — keep focus on the dialog itself rather
        // than letting it escape to the page behind the backdrop.
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        // Shift+Tab from the first (or from outside the set, e.g. the
        // dialog element itself) wraps to the last.
        if (active === first || !dialog.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab from the last (or from outside the set) wraps to the
        // first.
        if (active === last || !dialog.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    dialog.addEventListener("keydown", handleKeyDown)

    // Optional auto-focus on open. Prefer an explicit `initialFocusRef`
    // target; otherwise focus the first focusable element. Saves every
    // consumer from re-implementing the same focus `useEffect`.
    if (autoFocusFirstRef.current) {
      const target =
        initialFocusRef_.current?.current ?? getFocusable(dialog)[0] ?? null
      if (target) {
        try {
          target.focus()
        } catch {
          // swallow — auto-focus is best-effort.
        }
      }
    }

    return () => {
      dialog.removeEventListener("close", handleClose)
      dialog.removeEventListener("keydown", handleKeyDown)
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

  // Self-contained Tailwind chrome — strict-parity translation of the
  // resolved `signin-modal app-modal` cascade. Specificity / source
  // order resolved against components.css + landing.css:
  //   - position/radius/padding: `dialog.signin-modal.app-modal`
  //     (components.css, 0-2-1) wins → relative / var(--radius) / 0.
  //   - inset/margin/max-height/overflow: `dialog.signin-modal`
  //     (components.css, 0-1-1) wins.
  //   - width/max-width/background/box-shadow/animation: the two plain
  //     `.signin-modal` rules tie at 0-1-0, landing.css is imported
  //     later → landing wins (90vw / 420px / --color-off-white /
  //     0 24px 64px --navy-overlay-30 / modalSlideUp).
  //   - border: both 0-1-0 set `1px solid var(--border-default)`.
  //   - <799px: landing's media `.signin-modal` (0-1-0) sets width:100%
  //     / max-width:none (radius:0 there is OUT-specificity'd by the
  //     0-2-1 app-modal rule, so radius stays var(--radius)).
  // The inline `maxWidth` prop still wins over max-w-[420px] via the
  // style attribute. Backdrop uses the added --modal-backdrop token
  // (black at 50% alpha in light / --navy-overlay-70 in dark).
  // `text-[var(--fg-primary)] font-normal normal-case tracking-normal`
  // establish a clean typographic baseline so the modal renders normal
  // body text regardless of the DOM context it's mounted in. A native
  // <dialog> inherits CSS from its DOM parent (top-layer rendering does
  // NOT reset inheritance), so a modal opened from inside, e.g., the
  // cert-detail meta-label <dt> (uppercase/semibold/letter-spaced/muted)
  // would otherwise pick up all of that. No-op for modals mounted in
  // normal text.
  const baseChrome =
    "relative inset-0 m-auto flex w-[90vw] max-w-[420px] max-h-[calc(100vh-40px)] flex-col items-stretch overflow-x-hidden overflow-y-auto rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--color-off-white)] p-0 text-[var(--fg-primary)] font-normal normal-case tracking-normal shadow-[0_24px_64px_var(--navy-overlay-30)] backdrop:bg-[var(--modal-backdrop)] motion-safe:animate-[modalSlideUp_300ms_cubic-bezier(0.16,1,0.3,1)] max-[799px]:w-full max-[799px]:max-w-none"

  const composedClassName = className
    ? `${baseChrome} ${className}`
    : baseChrome

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
