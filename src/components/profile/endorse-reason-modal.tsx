"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ThumbsUp, X } from "lucide-react"
import Button from "@/components/ui/button"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"

/** Shape of one selectable list — kept structurally compatible with
 *  `useEndorsementLists`'s `EndorsementList` so the caller can pass
 *  its lists in directly without remapping. */
export interface EndorseReasonListOption {
  rkey: string
  title: string
}

/** Naming for the three parties involved when the endorsement is
 *  delegated — the viewer is acting AS a group rather than themselves.
 *  When present the modal swaps its prompt for a delegation header and
 *  hides the list picker (endorsement lists are personal-only). */
export interface EndorseReasonActingAs {
  /** Display name of the group authoring the endorsement. */
  orgName: string
  /** Handle of the group (without the leading @). */
  orgHandle: string
  /** Handle of the signed-in operator acting on the group's behalf. */
  operatorHandle: string
  /** The operator's actual role in the group (owner / admin / member) —
   *  never hard-coded, so the copy reflects the real relationship. */
  operatorRole: string
}

interface EndorseReasonModalProps {
  /** Display name / handle of the person being endorsed, surfaced in
   *  the subtitle so the issuer is reminded who they're writing
   *  about. */
  readonly subjectLabel: string
  /** Set when the viewer is acting AS a group. Names all three parties
   *  (group, operator, subject) in a header line so the delegation is
   *  explicit, and suppresses the list picker since endorsement lists
   *  are personal-only. */
  readonly actingAs?: EndorseReasonActingAs
  /** Optional viewer-owned endorsement lists. When non-empty the
   *  modal surfaces an "Add to list" picker; selecting one appends
   *  the new award to that list after creation. Empty / undefined
   *  hides the picker entirely. */
  readonly lists?: readonly EndorseReasonListOption[]
  /** Called with the trimmed note (may be empty) and the chosen list
   *  rkey (null when "None" is selected or no lists were passed)
   *  when the issuer confirms. Caller does the write + optimistic
   *  flip; this modal just captures input. Throw to keep the modal
   *  open with the error text shown. */
  readonly onConfirm: (note: string, listRkey: string | null) => Promise<unknown>
  readonly onClose: () => void
}

/** Lexicon-side hard cap on `note` lengths the UI enforces. Matches
 *  `BADGE_AWARD_NOTE_MAX` in badges.ts. */
const NOTE_MAX = 500

/**
 * Reason capture for a single endorsement. Shown when the viewer
 * clicks Endorse on the profile sidebar — collects a free-form note
 * that lands in `app.certified.badge.award.note`. The note is
 * optional (the lexicon allows omitting it) but the prompt nudges
 * users to add context so the recipient understands the basis for
 * the endorsement.
 *
 * Character counter is live and the textarea is hard-capped at 500
 * characters via `maxLength` AND a `slice` in the submit handler —
 * belt-and-suspenders so a paste exceeding the limit gets truncated
 * before it hits the PDS instead of erroring out at write time.
 */
export default function EndorseReasonModal({
  subjectLabel,
  actingAs,
  lists,
  onConfirm,
  onClose,
}: EndorseReasonModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [note, setNote] = useState("")
  const [selectedListRkey, setSelectedListRkey] = useState<string>("")
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AppDialog owns the showModal()/close lifecycle; this only owns
  // the autofocus.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (isWriting) return
      setIsWriting(true)
      setError(null)
      try {
        await onConfirm(
          note.slice(0, NOTE_MAX),
          selectedListRkey === "" ? null : selectedListRkey,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to endorse")
        setIsWriting(false)
      }
    },
    [isWriting, note, selectedListRkey, onConfirm],
  )

  // Endorsement lists are personal-only — never surface the picker
  // while the viewer is acting as a group, even if their personal repo
  // has lists.
  const showListPicker = !actingAs && !!lists && lists.length > 0

  const remaining = NOTE_MAX - note.length

  return (
    <AppDialog
      ariaLabel="Endorse"
      className="endorse-reason-modal"
      maxWidth={460}
      onClose={onClose}
      disableBackdropClose={isWriting}
    >
      <AppDialogHeader
        title={`Endorse ${subjectLabel}`}
        onClose={onClose}
        disabled={isWriting}
      />

        <form className="px-5 pb-5 pt-0 endorse-reason-modal__body" onSubmit={handleSubmit}>
          {actingAs ? (
            <p className="endorse-reason-modal__acting-as" role="note">
              <b>{actingAs.orgName}</b> will endorse {subjectLabel}. You (@
              {actingAs.operatorHandle}) are acting as its {actingAs.operatorRole}.
            </p>
          ) : null}

          <label className="endorse-reason-modal__field">
            <span className="endorse-reason-modal__prompt">
              Briefly explain your endorsement, e.g. do you know them
              directly?
            </span>
            <textarea
              ref={textareaRef}
              className="endorse-reason-modal__textarea"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              rows={4}
              disabled={isWriting}
              placeholder="Optional — leave blank to skip"
            />
            <span
              className={`endorse-reason-modal__counter${
                remaining <= 25 ? " endorse-reason-modal__counter--warn" : ""
              }`}
              aria-live="polite"
            >
              {remaining} character{remaining === 1 ? "" : "s"} left
            </span>
          </label>

          {showListPicker ? (
            <label className="endorse-reason-modal__field">
              <span className="endorse-reason-modal__prompt">
                Add to a list (optional)
              </span>
              <select
                className="endorse-reason-modal__select"
                value={selectedListRkey}
                onChange={(e) => setSelectedListRkey(e.target.value)}
                disabled={isWriting}
              >
                <option value="">None</option>
                {lists!.map((l) => (
                  <option key={l.rkey} value={l.rkey}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? (
            <p className="endorse-reason-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="endorse-reason-modal__footer">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isWriting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isWriting}
              disabled={isWriting}
            >
              <ThumbsUp size={14} strokeWidth={1.75} aria-hidden />
              Endorse
            </Button>
          </div>
        </form>
    </AppDialog>
  )
}
