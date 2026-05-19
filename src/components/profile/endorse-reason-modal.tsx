"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ThumbsUp, X } from "lucide-react"
import Button from "@/components/ui/button"
import AppDialog from "@/components/ui/app-dialog"

interface EndorseReasonModalProps {
  /** Display name / handle of the person being endorsed, surfaced in
   *  the subtitle so the issuer is reminded who they're writing
   *  about. */
  readonly subjectLabel: string
  /** Called with the trimmed note (may be empty) when the issuer
   *  confirms. Caller does the write + optimistic flip; this modal
   *  just captures input. Throw to keep the modal open with the
   *  error text shown. */
  readonly onConfirm: (note: string) => Promise<unknown>
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
  onConfirm,
  onClose,
}: EndorseReasonModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [note, setNote] = useState("")
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
        await onConfirm(note.slice(0, NOTE_MAX))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to endorse")
        setIsWriting(false)
      }
    },
    [isWriting, note, onConfirm],
  )

  const remaining = NOTE_MAX - note.length

  return (
    <AppDialog
      ariaLabel="Endorse"
      className="endorse-reason-modal"
      maxWidth={460}
      onClose={onClose}
      disableBackdropClose={isWriting}
    >
      <div className="signin-modal__header">
          <span className="signin-modal__title">Endorse {subjectLabel}</span>
          <button
            type="button"
            className="signin-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={isWriting}
          >
            <X size={18} />
          </button>
        </div>

        <form className="signin-modal__body endorse-reason-modal__body" onSubmit={handleSubmit}>
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
