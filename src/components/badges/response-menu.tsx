"use client"

import { useCallback, useState } from "react"
import { Check, X } from "lucide-react"
import {
  createResponse,
  deleteAllResponsesForAward,
  type BadgeResponseRecord,
  type ResponseState,
} from "@/lib/atproto/badges"
import { ToggleGroup } from "@/components/ui/segmented-control"

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
  /** Group DID when the viewer is acting AS that group (responses are
   *  authored on the group's repo). Undefined for personal responses. */
  readonly targetDid?: string
  /** Invoked after a write so the parent can refresh state + drop
   *  the row from the visible list when the action was Hide. */
  readonly onAfterWrite?: () => void | Promise<void>
}

/**
 * Quiet color-coded quick-actions control rendered on profile /
 * endorsements audit-surface rows (the row's owner is viewing their
 * own wall).
 *
 * Two joined icon buttons — Accept (Check, green/success) and Reject
 * (X, amber/warning). Both buttons are always shown; the active one
 * carries `aria-pressed` and the tone-tinted active state so the
 * rendered decision is unambiguous. No menu, no kebab.
 *
 * Single-click toggle:
 *   - clicking the currently-active state → reset to default
 *   - clicking the other state → write that response
 */
export default function ResponseMenu({
  awardUri,
  awardCid,
  issuerDisplayName,
  ownerDid,
  state,
  allResponses,
  targetDid,
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
          { targetDid },
        )
        await onAfterWrite?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update")
      } finally {
        setIsWriting(false)
      }
    },
    [ownerDid, awardUri, awardCid, targetDid, onAfterWrite],
  )

  const resetToDefault = useCallback(async () => {
    if (!ownerDid) return
    setIsWriting(true)
    setError(null)
    try {
      await deleteAllResponsesForAward(ownerDid, awardUri, allResponses, {
        targetDid,
      })
      await onAfterWrite?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset")
    } finally {
      setIsWriting(false)
    }
  }, [ownerDid, awardUri, allResponses, targetDid, onAfterWrite])

  /** Single-click toggle:
   *    - clicking the currently-active state → reset to default
   *    - clicking the other state → write that response
   * Both buttons are always shown; the active one carries the
   * tone-tinted active state so the rendered state is unambiguous.
   * Clicking the active button serves the "reset to default" role. */
  const onAccept = useCallback(() => {
    if (state === "accepted") void resetToDefault()
    else void writeResponse("accepted")
  }, [state, resetToDefault, writeResponse])

  const onReject = useCallback(() => {
    if (state === "rejected") void resetToDefault()
    else void writeResponse("rejected")
  }, [state, resetToDefault, writeResponse])

  // The pressed set: exactly the currently-active state (accept XOR
  // reject), empty for default/unknown. A toggle of "accepted" routes
  // to onAccept and "rejected" to onReject regardless of direction —
  // both pressing and un-pressing a value emit it in the diff below.
  const pressedValues =
    state === "accepted"
      ? ["accepted"]
      : state === "rejected"
        ? ["rejected"]
        : []

  const onValueChange = useCallback(
    (next: string[]) => {
      const prev = new Set(pressedValues)
      // Whichever value changed membership (added when un-pressed → pressed,
      // removed when the active button is clicked to reset) is the one the
      // user actuated.
      const toggled =
        next.find((v) => !prev.has(v)) ??
        ["accepted", "rejected"].find((v) => prev.has(v) && !next.includes(v))
      if (toggled === "accepted") onAccept()
      else if (toggled === "rejected") onReject()
    },
    [pressedValues, onAccept, onReject],
  )

  const disabled = !ownerDid || isWriting

  return (
    <div className="relative flex-shrink-0" aria-busy={isWriting}>
      <ToggleGroup
        aria-label={`Respond to endorsement from ${issuerDisplayName}`}
        value={pressedValues}
        onValueChange={onValueChange}
        size="sm"
        orientation="vertical"
        iconOnly
        options={[
          {
            value: "accepted",
            tone: "success",
            icon: <Check size={14} strokeWidth={2.25} aria-hidden="true" />,
            ariaLabel:
              state === "accepted"
                ? `Reset accepted endorsement from ${issuerDisplayName} to default`
                : `Accept endorsement from ${issuerDisplayName}`,
            disabled,
          },
          {
            value: "rejected",
            tone: "warn",
            icon: <X size={14} strokeWidth={2.25} aria-hidden="true" />,
            ariaLabel:
              state === "rejected"
                ? `Reset rejected endorsement from ${issuerDisplayName} to default`
                : `Reject endorsement from ${issuerDisplayName}`,
            disabled,
          },
        ]}
      />
      {error ? (
        <p className="text-[0.6875rem] text-[var(--color-error)] mt-1" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
