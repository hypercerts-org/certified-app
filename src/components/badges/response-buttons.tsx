"use client"

import { useCallback, useState } from "react"
import {
  createResponse,
  type ResponseState,
} from "@/lib/atproto/badges"

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
  /** Called after a successful write so the parent can invalidate
   *  caches and re-render with the new state. */
  readonly onAfterWrite?: () => void | Promise<void>
}

/**
 * Loud inline Show / Hide buttons rendered next to an incoming
 * endorsement on the /notifications surface.
 *
 * Why two buttons, not a toggle: per WAI-ARIA toggle-group pattern,
 * users with screen readers benefit from both options being visible
 * even when one is the current state. `aria-pressed` carries the
 * binary state; the parent `role="group"` element gives per-row
 * context.
 *
 * Why no separate "default" affordance: in default state both
 * buttons are unpressed; clicking Show writes an `accepted` record,
 * clicking Hide writes a `rejected` record. "Reset to default" is
 * the kebab-menu surface (response-menu.tsx); on the notification
 * surface we keep it to the two primary actions.
 */
export default function ResponseButtons({
  awardUri,
  awardCid,
  issuerDisplayName,
  ownerDid,
  state,
  onAfterWrite,
}: ResponseButtonsProps) {
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
        )
        await onAfterWrite?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update")
      } finally {
        setIsWriting(null)
      }
    },
    [ownerDid, awardUri, awardCid, onAfterWrite],
  )

  // "unknown" — the record on the PDS has a response value we don't
  // recognise. Treat as default for control purposes: neither
  // button is pressed, both are clickable, and the SR-only context
  // gives users an explicit notice.
  const isAccepted = state === "accepted"
  const isRejected = state === "rejected"
  const isUnknown = state === "unknown"

  return (
    <div
      role="group"
      aria-label={`Response to endorsement from ${issuerDisplayName}`}
      aria-busy={isWriting !== null}
      className="response-buttons"
    >
      {isUnknown ? (
        <span className="sr-only">
          The current response state is not recognised by this app.
        </span>
      ) : null}
      <button
        type="button"
        aria-pressed={isAccepted}
        disabled={!ownerDid || isWriting !== null}
        onClick={() => write("accepted")}
        className={`response-buttons__btn response-buttons__btn--show ${
          isAccepted ? "response-buttons__btn--pressed" : ""
        }`}
      >
        {isWriting === "show" ? "Saving…" : "Show"}
      </button>
      <button
        type="button"
        aria-pressed={isRejected}
        disabled={!ownerDid || isWriting !== null}
        onClick={() => write("rejected")}
        className={`response-buttons__btn response-buttons__btn--hide ${
          isRejected ? "response-buttons__btn--pressed" : ""
        }`}
      >
        {isWriting === "hide" ? "Saving…" : "Hide"}
      </button>
      {error ? (
        <span className="response-buttons__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
