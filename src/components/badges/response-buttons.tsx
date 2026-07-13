"use client"

import { useCallback, useMemo, useState } from "react"
import {
  createResponse,
  type ResponseState,
} from "@/lib/atproto/badges"
import { ToggleGroup } from "@/components/ui/segmented-control"

interface ResponseButtonsProps {
  /** The award being responded to — passed through to createResponse
   *  as a strongRef. */
  readonly awardUri: string
  readonly awardCid: string
  /** Issuer display name — for the group's aria-label so screen
   *  readers know which award this control is acting on. */
  readonly issuerDisplayName: string
  /** Authenticated viewer's DID. The owner of the response record.
   *  When null/undefined the control renders disabled. */
  readonly ownerDid: string | null
  /** Current resolved state — drives which button is `aria-pressed`. */
  readonly state: ResponseState
  /** Visible labels:
   *   - "show-hide"     (default) "Show on my profile" framing
   *   - "accept-reject" for the /endorsements Received list, where
   *     the user is reviewing endorsements as a thing they can
   *     accept or reject rather than "show on my profile".
   *  Both write the same `accepted` / `rejected` response record. */
  readonly labelStyle?: "show-hide" | "accept-reject"
  /** Group DID when the viewer is acting AS that group (the response is
   *  authored on the group's repo). Undefined for personal responses. */
  readonly targetDid?: string
  /** Called after a successful write so the parent can invalidate
   *  caches and re-render with the new state. */
  readonly onAfterWrite?: () => void | Promise<void>
}

/**
 * Loud inline Show / Hide buttons rendered next to an incoming
 * endorsement.
 *
 * Why two buttons, not a single toggle: per WAI-ARIA toggle-group
 * pattern, users with screen readers benefit from both options being
 * visible even when one is the current state. Each option carries its
 * own `aria-pressed` (rendered by <ToggleGroup>); the group's
 * `role="group"` element gives per-row context.
 *
 * Why no separate "default" affordance: in default state both
 * buttons are unpressed; clicking Show writes an `accepted` record,
 * clicking Hide writes a `rejected` record. "Reset to default" is
 * the kebab-menu surface (response-menu.tsx); here we keep it to the
 * two primary actions.
 */
export default function ResponseButtons({
  awardUri,
  awardCid,
  issuerDisplayName,
  ownerDid,
  state,
  labelStyle = "show-hide",
  targetDid,
  onAfterWrite,
}: ResponseButtonsProps) {
  const labels = labelStyle === "accept-reject"
    ? { accept: "Accept", reject: "Reject" }
    : { accept: "Show", reject: "Hide" }
  const [isWriting, setIsWriting] = useState<"show" | "hide" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const write = useCallback(
    async (response: "accepted" | "rejected") => {
      if (!ownerDid) return
      setIsWriting(response === "accepted" ? "show" : "hide")
      setError(null)
      try {
        await createResponse(
          ownerDid,
          { uri: awardUri, cid: awardCid },
          response,
          { targetDid },
        )
        await onAfterWrite?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update")
      } finally {
        setIsWriting(null)
      }
    },
    [ownerDid, awardUri, awardCid, targetDid, onAfterWrite],
  )

  // "unknown" — the record on the PDS has a response value we don't
  // recognise. Treat as default for control purposes: neither
  // button is pressed, both are clickable, and the SR-only context
  // gives users an explicit notice.
  const isAccepted = state === "accepted"
  const isRejected = state === "rejected"
  const isUnknown = state === "unknown"

  // The set of currently-pressed values for the ToggleGroup. At most one
  // of accept/reject is pressed at a time (accepted XOR rejected); an
  // unknown/default state presses neither. Memoized so onValueChange
  // keeps a stable identity across unrelated re-renders.
  const pressedValues = useMemo(
    () => (isAccepted ? ["accepted"] : isRejected ? ["rejected"] : []),
    [isAccepted, isRejected],
  )

  // Translate a toggle into a write. Clicking either button always
  // writes its response (matching the original "no reset here" intent),
  // so we diff the emitted set against the current one to learn which
  // option the user actuated, then write that response.
  const onValueChange = useCallback(
    (next: string[]) => {
      const prev = new Set(pressedValues)
      const added = next.find((v) => !prev.has(v))
      // `added` is set when the user pressed a currently-unpressed button.
      // When they click the already-pressed button it's removed from the
      // set instead; the original buttons re-wrote the same response on
      // that click, so resolve to whichever option is no longer in `next`.
      const toggled =
        added ?? ["accepted", "rejected"].find((v) => prev.has(v) && !next.includes(v))
      if (toggled === "accepted") void write("accepted")
      else if (toggled === "rejected") void write("rejected")
    },
    [pressedValues, write],
  )

  const writing = isWriting !== null
  const disabled = !ownerDid || writing

  return (
    <div
      role="group"
      aria-label={`Response to endorsement from ${issuerDisplayName}`}
      aria-busy={writing}
      className="inline-flex items-center gap-1.5 flex-shrink-0"
    >
      {isUnknown ? (
        <span className="sr-only">
          The current response state is not recognised by this app.
        </span>
      ) : null}
      <ToggleGroup
        aria-label={`Response to endorsement from ${issuerDisplayName}`}
        value={pressedValues}
        onValueChange={onValueChange}
        joined={false}
        tone="neutral"
        size="sm"
        options={[
          {
            value: "accepted",
            label: isWriting === "show" ? "Saving…" : labels.accept,
            disabled,
          },
          {
            value: "rejected",
            label: isWriting === "hide" ? "Saving…" : labels.reject,
            disabled,
          },
        ]}
      />
      {error ? (
        <span className="text-[0.6875rem] text-[var(--color-error)] ml-1.5" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
