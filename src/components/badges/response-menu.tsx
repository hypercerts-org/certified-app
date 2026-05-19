"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { Check, MoreHorizontal, RotateCcw, X } from "lucide-react"
import {
  createResponse,
  deleteAllResponsesForAward,
  type BadgeResponseRecord,
  type ResponseState,
} from "@/lib/atproto/badges"

interface ResponseMenuProps {
  readonly awardUri: string
  readonly awardCid: string
  /** Used in the trigger's aria-label so SR users get per-row context. */
  readonly issuerDisplayName: string
  readonly ownerDid: string | null
  readonly state: ResponseState
  /** All of the owner's response records — needed for "Reset to default"
   *  which sweeps every vestigial response targeting this award. */
  readonly allResponses: BadgeResponseRecord[]
  /** Invoked after a write so the parent can refresh state + drop
   *  the row from the visible list when the action was Hide. */
  readonly onAfterWrite?: () => void | Promise<void>
}

/**
 * Quiet kebab-menu control rendered on profile / endorsements
 * audit-surface rows (the row's owner is viewing their own wall).
 *
 * Owner-only state indicator at the top of the menu, then the
 * actions:
 *
 *   - default  → "Showing on your profile (default)" +
 *                "Hide from profile"
 *   - accepted → "Showing on your profile"           +
 *                "Hide from profile" + "Reset to default"
 *   - rejected → "Hidden from your profile"          +
 *                "Show on profile" + "Reset to default"
 *   - unknown  → "Unrecognised response state"       +
 *                "Hide from profile" + "Reset to default"
 *
 * The kebab is only rendered on the profile owner's view (see the
 * ProfileEndorsements + /endorsements page gating) — non-owner
 * viewers never see the indicator, matching the plan §"Accept-state
 * visibility" owner-only contract.
 *
 * Keyboard contract (WAI-ARIA menu pattern):
 *   - Trigger: Enter/Space opens; first menuitem auto-focuses.
 *   - In menu: ArrowUp/ArrowDown moves between items; Home/End jump
 *     to first/last. Esc closes + returns focus to trigger.
 *     Outside-click closes.
 *
 * After Hide on a row, the row removes from its list. Focus moves
 * to the next sibling's kebab via `findNextFocusTarget`. Plan
 * AC#7. AC#8 shows a 6-second `aria-live="polite"` undo toast
 * anchored to the menu column.
 */
export default function ResponseMenu({
  awardUri,
  awardCid,
  issuerDisplayName,
  ownerDid,
  state,
  allResponses,
  onAfterWrite,
}: ResponseMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------------------------
  // Outside-click + Esc close.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current || !triggerRef.current) return
      if (
        menuRef.current.contains(e.target as Node) ||
        triggerRef.current.contains(e.target as Node)
      ) {
        return
      }
      setIsOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [isOpen])

  // Auto-focus the first menuitem when the menu opens so keyboard
  // users land *inside* the menu, not still on the trigger.
  useEffect(() => {
    if (!isOpen || !menuRef.current) return
    const first = menuRef.current.querySelector<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    )
    first?.focus()
  }, [isOpen])

  // Arrow-key roving inside the menu (WAI-ARIA menu pattern). Tab
  // still works — it just leaves the menu, which is also expected
  // for menus.
  const handleMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    )
    if (!items || items.length === 0) return
    const list = Array.from(items)
    const current = document.activeElement as HTMLElement | null
    const idx = current ? list.indexOf(current) : -1
    let next = idx
    if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % list.length
    else if (e.key === "ArrowUp")
      next = idx <= 0 ? list.length - 1 : idx - 1
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = list.length - 1
    else return
    e.preventDefault()
    list[next].focus()
  }

  /** Find the next focusable kebab trigger in the same list. Used
   *  on Hide so focus moves to the sibling row rather than falling
   *  to <body>. (Plan AC#7.) */
  const findNextFocusTarget = (): HTMLElement | null => {
    const t = triggerRef.current
    if (!t) return null
    const list = t.closest(".endorsements-list")
    if (!list) return null
    const all = Array.from(
      list.querySelectorAll<HTMLElement>(".response-menu__trigger"),
    )
    const i = all.indexOf(t)
    if (i < 0) return null
    return all[i + 1] ?? all[i - 1] ?? null
  }

  const finishWrite = useCallback(
    async (afterFocusTarget?: HTMLElement | null) => {
      await onAfterWrite?.()
      if (afterFocusTarget && document.contains(afterFocusTarget)) {
        afterFocusTarget.focus()
      } else {
        triggerRef.current?.focus()
      }
    },
    [onAfterWrite],
  )

  const writeResponse = useCallback(
    async (resp: "accepted" | "rejected") => {
      if (!ownerDid) return
      setIsWriting(true)
      setError(null)
      // Capture the focus target BEFORE the write because the row
      // may be removed by the parent's refetch and we want a stable
      // sibling reference.
      const focusTarget = resp === "rejected" ? findNextFocusTarget() : null
      try {
        await createResponse(
          ownerDid,
          { uri: awardUri, cid: awardCid },
          resp,
        )
        setIsOpen(false)
        await finishWrite(focusTarget)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update")
      } finally {
        setIsWriting(false)
      }
    },
    [ownerDid, awardUri, awardCid, finishWrite],
  )

  const resetToDefault = useCallback(async () => {
    if (!ownerDid) return
    setIsWriting(true)
    setError(null)
    try {
      await deleteAllResponsesForAward(ownerDid, awardUri, allResponses)
      setIsOpen(false)
      await finishWrite(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset")
    } finally {
      setIsWriting(false)
    }
  }, [ownerDid, awardUri, allResponses, finishWrite])

  const hasResponse = state === "accepted" || state === "rejected"

  // State-aware trigger (#77):
  //   - default: render two inline pill-buttons (Accept / Reject)
  //     so the most-common actions are one click, not buried in a
  //     kebab menu. The kebab disappears in this state.
  //   - accepted / rejected: render the status as the trigger
  //     glyph (✓ / ✕). Click opens the existing menu so the user
  //     can flip the decision or reset.
  //   - unknown: fall back to the kebab (something else wrote a
  //     response we don't model; finer control via the menu).
  return (
    <div className="response-menu" aria-busy={isWriting}>
      {state === "default" ? (
        <div
          className="response-menu__quick-actions"
          role="group"
          aria-label={`Respond to endorsement from ${issuerDisplayName}`}
        >
          <button
            type="button"
            className="response-menu__quick-btn response-menu__quick-btn--accept"
            aria-label={`Accept endorsement from ${issuerDisplayName}`}
            title="Accept"
            onClick={() => writeResponse("accepted")}
            disabled={!ownerDid || isWriting}
          >
            <Check size={14} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="response-menu__quick-btn response-menu__quick-btn--reject"
            aria-label={`Reject endorsement from ${issuerDisplayName}`}
            title="Reject"
            onClick={() => writeResponse("rejected")}
            disabled={!ownerDid || isWriting}
          >
            <X size={14} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={`response-menu__trigger response-menu__trigger--${state}`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={
            state === "accepted"
              ? `Endorsement from ${issuerDisplayName} accepted — change decision`
              : state === "rejected"
                ? `Endorsement from ${issuerDisplayName} rejected — change decision`
                : `Manage endorsement from ${issuerDisplayName}`
          }
          title={
            state === "accepted"
              ? "Accepted"
              : state === "rejected"
                ? "Rejected"
                : "Manage"
          }
          onClick={() => setIsOpen((v) => !v)}
          disabled={!ownerDid || isWriting}
        >
          {state === "accepted" ? (
            <Check size={14} strokeWidth={2.25} aria-hidden="true" />
          ) : state === "rejected" ? (
            <X size={14} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <MoreHorizontal size={16} aria-hidden="true" />
          )}
        </button>
      )}
      {isOpen ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Endorsement from ${issuerDisplayName}`}
          className="response-menu__menu"
          onKeyDown={handleMenuKey}
        >
          {state === "rejected" ? (
            <button
              type="button"
              role="menuitem"
              className="response-menu__item"
              onClick={() => writeResponse("accepted")}
              disabled={isWriting}
            >
              <Check size={14} aria-hidden="true" />
              <span>Accept</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="response-menu__item"
              onClick={() => writeResponse("rejected")}
              disabled={isWriting}
            >
              <X size={14} aria-hidden="true" />
              <span>Reject</span>
            </button>
          )}
          {hasResponse ? (
            <button
              type="button"
              role="menuitem"
              className="response-menu__item"
              onClick={resetToDefault}
              disabled={isWriting}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reset to default</span>
            </button>
          ) : null}
          {error ? (
            <p className="response-menu__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
