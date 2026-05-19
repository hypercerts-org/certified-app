"use client"

import { useCallback, useState } from "react"
import { Check, X } from "lucide-react"
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
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const writeResponse = useCallback(
    async (resp: "accepted" | "rejected") => {
      if (!ownerDid) return
      setIsWriting(true)
      setError(null)
      try {
        await createResponse(
          ownerDid,
          { uri: awardUri, cid: awardCid },
          resp,
        )
        await onAfterWrite?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update")
      } finally {
        setIsWriting(false)
      }
    },
    [ownerDid, awardUri, awardCid, onAfterWrite],
  )

  const resetToDefault = useCallback(async () => {
    if (!ownerDid) return
    setIsWriting(true)
    setError(null)
    try {
      await deleteAllResponsesForAward(ownerDid, awardUri, allResponses)
      await onAfterWrite?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset")
    } finally {
      setIsWriting(false)
    }
  }, [ownerDid, awardUri, allResponses, onAfterWrite])

  /** Single-click toggle:
   *    - clicking the currently-active state → reset to default
   *    - clicking the other state → write that response
   * Both buttons are always shown; the active one carries the
   * `--active` class so the rendered state is unambiguous. No
   * menu, no kebab, no reset-to-default menuitem (clicking the
   * active button serves that role). */
  const onAcceptClick = useCallback(() => {
    if (state === "accepted") resetToDefault()
    else writeResponse("accepted")
  }, [state, resetToDefault, writeResponse])

  const onRejectClick = useCallback(() => {
    if (state === "rejected") resetToDefault()
    else writeResponse("rejected")
  }, [state, resetToDefault, writeResponse])

  return (
    <div className="response-menu" aria-busy={isWriting}>
      <div
        className="response-menu__quick-actions"
        role="group"
        aria-label={`Respond to endorsement from ${issuerDisplayName}`}
      >
        <button
          type="button"
          className={`response-menu__quick-btn response-menu__quick-btn--accept ${
            state === "accepted"
              ? "response-menu__quick-btn--active"
              : ""
          }`}
          aria-label={
            state === "accepted"
              ? `Reset accepted endorsement from ${issuerDisplayName} to default`
              : `Accept endorsement from ${issuerDisplayName}`
          }
          aria-pressed={state === "accepted"}
          title={state === "accepted" ? "Accepted — click to reset" : "Accept"}
          onClick={onAcceptClick}
          disabled={!ownerDid || isWriting}
        >
          <Check size={14} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`response-menu__quick-btn response-menu__quick-btn--reject ${
            state === "rejected"
              ? "response-menu__quick-btn--active"
              : ""
          }`}
          aria-label={
            state === "rejected"
              ? `Reset rejected endorsement from ${issuerDisplayName} to default`
              : `Reject endorsement from ${issuerDisplayName}`
          }
          aria-pressed={state === "rejected"}
          title={state === "rejected" ? "Rejected — click to reset" : "Reject"}
          onClick={onRejectClick}
          disabled={!ownerDid || isWriting}
        >
          <X size={14} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p className="response-menu__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
