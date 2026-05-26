"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Check, Search, UserPlus, X } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import { getInitials } from "@/lib/utils/initials"

interface Actor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

interface EndorsePeopleModalProps {
  /** DID of the signed-in user issuing the endorsements. */
  readonly viewerDid: string
  /**
   * Set of subject DIDs the viewer has ALREADY endorsed — used to grey
   * out their rows in the search results and skip them on confirm so
   * we don't accidentally write a second award.
   */
  readonly alreadyEndorsedDids: ReadonlySet<string>
  /**
   * Per-row write callback. Called once per selected DID inside the
   * confirm loop. The default endorsements path uses this to issue a
   * regular `createEndorsementAward`; the list-detail "+ Add people"
   * flow uses this to ensure-endorse + append the new award to the
   * list's collection record. Anything that throws marks the row as
   * failed but doesn't break the rest of the batch.
   */
  readonly onEndorse: (subjectDid: string, note?: string) => Promise<unknown>
  /** Modal header text. Defaults to "Endorse people". */
  readonly title?: string
  /** Optional secondary line under the header for context (e.g. the
   *  list name when used from the lists detail view). */
  readonly subtitle?: string
  /** CTA prefix shown on the confirm button when multiple rows are
   *  selected. Defaults to "Endorse" (renders "Endorse 3 people"). */
  readonly confirmActionLabel?: string
  /** Label rendered in the row's status column when the row is
   *  already in the target set. Defaults to "Endorsed". */
  readonly alreadyLabel?: string
  /** When true, render a textarea for an optional reason that gets
   *  attached to EVERY award written by this batch (passed as the
   *  second argument to `onEndorse`). Defaults to false so the
   *  list-detail "+ Add people" flow stays clean — the list itself
   *  is the reason there. */
  readonly requireReason?: boolean
  /** Close the modal (cancel — discard any unconfirmed selections). */
  readonly onClose: () => void
  /**
   * Called after the batch has been written. Receives the DIDs that
   * succeeded so the parent can refresh its list / show a confirmation
   * chip.
   */
  readonly onCompleted: (endorsedDids: string[]) => void
}

const SEARCH_DEBOUNCE_MS = 250

/**
 * Modal for endorsing one or many people in a single pass.
 *
 * Behaviour:
 *   - A search input wired to `/api/search-actors` (same endpoint
 *     `PeopleSearch` uses). Debounced 250ms so a fast typist doesn't
 *     spam the endpoint.
 *   - Each result row shows avatar + display name + handle and a
 *     toggle. Adding a row appends it to the bottom "Selected" list.
 *   - Already-endorsed accounts render with a "Endorsed" pill and
 *     are not selectable — re-endorsing is a no-op on the lexicon
 *     but the UI shouldn't suggest it as an action.
 *   - The viewer themselves is filtered out — you can't endorse
 *     yourself.
 *   - Confirm writes one badge.award per selected DID, then calls
 *     `onCompleted` with the URIs and lets the parent close + refresh.
 */
export default function EndorsePeopleModal({
  viewerDid,
  alreadyEndorsedDids,
  onEndorse,
  title = "Endorse people",
  subtitle,
  confirmActionLabel = "Endorse",
  alreadyLabel = "Endorsed",
  requireReason = false,
  onClose,
  onCompleted,
}: EndorsePeopleModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const requestSeq = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Actor[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selected, setSelected] = useState<Actor[]>([])
  // Per-DID status during the write phase so the row can show
  // pending/done/failed states as the batch progresses.
  const [writing, setWriting] = useState<
    Map<string, "pending" | "done" | "failed">
  >(() => new Map())
  const [isWriting, setIsWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shared reason for the batch — only used when `requireReason`
  // is set. Hard-capped at 500 chars to match `BADGE_AWARD_NOTE_MAX`
  // in badges.ts.
  const [note, setNote] = useState("")

  // AppDialog owns showModal/close. This effect handles the
  // search-input autofocus only.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced fetch against `/api/search-actors`. Same endpoint as the
  // global PeopleSearch. We bail early when the query is empty so the
  // results list collapses back to selected-only.
  const runSearch = useCallback(async (q: string, seq: number) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(
        `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
        { headers: { Accept: "application/json" } },
      )
      if (seq !== requestSeq.current) return
      if (res.ok) {
        const data = (await res.json()) as { actors?: Actor[] }
        setResults(data.actors ?? [])
      } else {
        setResults([])
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[endorse-people] search failed:", err)
      }
    } finally {
      if (seq === requestSeq.current) setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }
    const seq = ++requestSeq.current
    debounceRef.current = setTimeout(() => runSearch(query, seq), SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  // Helpers for toggling rows. Already-selected → remove, otherwise
  // add. Self and already-endorsed are filtered out at the row level.
  const selectedDids = useMemo(
    () => new Set(selected.map((a) => a.did)),
    [selected],
  )

  const toggle = useCallback(
    (actor: Actor) => {
      setSelected((prev) =>
        prev.some((a) => a.did === actor.did)
          ? prev.filter((a) => a.did !== actor.did)
          : [...prev, actor],
      )
    },
    [],
  )

  const removeSelected = useCallback((did: string) => {
    setSelected((prev) => prev.filter((a) => a.did !== did))
  }, [])

  const handleConfirm = useCallback(async () => {
    if (selected.length === 0 || isWriting) return
    setIsWriting(true)
    setError(null)
    const status = new Map<string, "pending" | "done" | "failed">()
    selected.forEach((a) => status.set(a.did, "pending"))
    setWriting(status)
    const succeeded: string[] = []
    const noteToSend = requireReason ? note.trim().slice(0, 500) : undefined
    for (const actor of selected) {
      try {
        await onEndorse(actor.did, noteToSend || undefined)
        status.set(actor.did, "done")
        setWriting(new Map(status))
        succeeded.push(actor.did)
      } catch (err) {
        status.set(actor.did, "failed")
        setWriting(new Map(status))
        console.error("Failed to endorse", actor.did, err)
        // Don't break the loop — a failure on one person shouldn't
        // block the rest. The final error string surfaces a count so
        // the user knows something partial happened.
      }
    }
    if (succeeded.length === selected.length) {
      onCompleted(succeeded)
    } else {
      const failed = selected.length - succeeded.length
      setError(
        `${succeeded.length} of ${selected.length} endorsements written — ${failed} failed.`,
      )
      // Leave the modal open so the user can see which rows failed
      // and retry / dismiss as they choose. The parent still hears
      // about the successes so its list refreshes.
      if (succeeded.length > 0) onCompleted(succeeded)
    }
    setIsWriting(false)
  }, [selected, isWriting, note, requireReason, onEndorse, onCompleted])

  return (
    <AppDialog
      ariaLabel={title}
      className="endorse-people-modal"
      maxWidth={560}
      onClose={onClose}
      disableBackdropClose={isWriting}
    >
      <AppDialogHeader title={title} onClose={onClose} disabled={isWriting} />

        <div className="signin-modal__body endorse-people-modal__body">
          {subtitle ? (
            <p className="endorse-people-modal__subtitle">{subtitle}</p>
          ) : null}

          {requireReason ? (
            <label className="endorse-people-modal__reason">
              <span className="endorse-people-modal__reason-label">
                Briefly explain your endorsement
              </span>
              <span className="endorse-people-modal__reason-hint">
                The same reason will be added to every person you endorse in
                this batch.
              </span>
              <textarea
                className="endorse-people-modal__reason-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                maxLength={500}
                rows={3}
                disabled={isWriting}
                placeholder="Optional — leave blank to skip"
              />
              <span
                className={`endorse-people-modal__reason-counter${
                  500 - note.length <= 25
                    ? " endorse-people-modal__reason-counter--warn"
                    : ""
                }`}
                aria-live="polite"
              >
                {500 - note.length} character{500 - note.length === 1 ? "" : "s"} left
              </span>
            </label>
          ) : null}

          <label className="endorse-people-modal__search">
            <Search
              size={16}
              strokeWidth={1.75}
              className="endorse-people-modal__search-icon"
              aria-hidden
            />
            <input
              ref={inputRef}
              type="search"
              className="endorse-people-modal__search-input"
              placeholder="Search for someone on atproto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Search people to endorse"
            />
          </label>

          <ResultsList
            results={results}
            isSearching={isSearching}
            query={query}
            viewerDid={viewerDid}
            alreadyEndorsedDids={alreadyEndorsedDids}
            alreadyLabel={alreadyLabel}
            selectedDids={selectedDids}
            onToggle={toggle}
          />

          {selected.length > 0 ? (
            <SelectedList
              selected={selected}
              writing={writing}
              onRemove={removeSelected}
              disabled={isWriting}
            />
          ) : null}

          {error ? (
            <p className="endorse-people-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="endorse-people-modal__footer">
            <Button variant="ghost" onClick={onClose} disabled={isWriting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              loading={isWriting}
              disabled={isWriting || selected.length === 0}
            >
              {selected.length > 1
                ? `${confirmActionLabel} ${selected.length} people`
                : confirmActionLabel}
            </Button>
          </div>
        </div>
    </AppDialog>
  )
}

interface ResultsListProps {
  results: Actor[]
  isSearching: boolean
  query: string
  viewerDid: string
  alreadyEndorsedDids: ReadonlySet<string>
  alreadyLabel: string
  selectedDids: Set<string>
  onToggle: (actor: Actor) => void
}

function ResultsList({
  results,
  isSearching,
  query,
  viewerDid,
  alreadyEndorsedDids,
  alreadyLabel,
  selectedDids,
  onToggle,
}: ResultsListProps) {
  if (!query.trim()) {
    return (
      <p className="endorse-people-modal__hint">
        Start typing a name or handle to find people to endorse.
      </p>
    )
  }
  if (isSearching && results.length === 0) {
    return (
      <div className="endorse-people-modal__loading">
        <LoadingSpinner size="sm" />
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <p className="endorse-people-modal__hint">
        No people found for &ldquo;{query.trim()}&rdquo;.
      </p>
    )
  }
  return (
    <ul
      className="endorse-people-modal__results"
      role="listbox"
      aria-label="Search results"
    >
      {results.map((actor) => {
        const isSelf = actor.did === viewerDid
        const isEndorsed = alreadyEndorsedDids.has(actor.did)
        const isSelected = selectedDids.has(actor.did)
        const disabled = isSelf || isEndorsed
        return (
          <li
            key={actor.did}
            className={`endorse-people-modal__result ${
              isSelected ? "endorse-people-modal__result--selected" : ""
            } ${disabled ? "endorse-people-modal__result--disabled" : ""}`}
          >
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              className="endorse-people-modal__result-btn"
              onClick={() => onToggle(actor)}
              disabled={disabled}
            >
              <Avatar
                size="sm"
                src={actor.avatar || undefined}
                fallbackInitials={getInitials(
                  actor.displayName || actor.handle,
                  actor.did,
                )}
              />
              <div className="endorse-people-modal__result-info">
                <span className="endorse-people-modal__result-name">
                  {actor.displayName || actor.handle}
                </span>
                <span className="endorse-people-modal__result-handle">
                  @{actor.handle}
                </span>
              </div>
              <span className="endorse-people-modal__result-status">
                {isSelf
                  ? "You"
                  : isEndorsed
                  ? alreadyLabel
                  : isSelected
                  ? (
                    <span className="endorse-people-modal__result-selected-chip">
                      <Check size={12} strokeWidth={2} aria-hidden /> Added
                    </span>
                  )
                  : "Add"}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface SelectedListProps {
  selected: Actor[]
  writing: Map<string, "pending" | "done" | "failed">
  onRemove: (did: string) => void
  disabled: boolean
}

function SelectedList({ selected, writing, onRemove, disabled }: SelectedListProps) {
  return (
    <div className="endorse-people-modal__selected">
      <h3 className="endorse-people-modal__selected-title">
        Selected ({selected.length})
      </h3>
      <ul className="endorse-people-modal__selected-list">
        {selected.map((actor) => {
          const state = writing.get(actor.did)
          return (
            <li key={actor.did} className="endorse-people-modal__chip">
              <Avatar
                size="sm"
                src={actor.avatar || undefined}
                fallbackInitials={getInitials(
                  actor.displayName || actor.handle,
                  actor.did,
                )}
              />
              <span className="endorse-people-modal__chip-name">
                {actor.displayName || actor.handle}
              </span>
              {state === "pending" ? (
                <LoadingSpinner size="sm" />
              ) : state === "done" ? (
                <Check size={14} strokeWidth={2} aria-hidden />
              ) : state === "failed" ? (
                <span className="endorse-people-modal__chip-failed">Failed</span>
              ) : (
                <button
                  type="button"
                  className="endorse-people-modal__chip-remove"
                  onClick={() => onRemove(actor.did)}
                  disabled={disabled}
                  aria-label={`Remove ${actor.handle}`}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="endorse-people-modal__selected-hint">
        <UserPlus size={12} strokeWidth={1.75} aria-hidden /> One endorsement
        record per person. You can revoke individual endorsements later from
        the Given tab.
      </p>
    </div>
  )
}
