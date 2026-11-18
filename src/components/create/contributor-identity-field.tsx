"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Combobox from "@/components/ui/combobox"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"

/**
 * Shared building blocks for the contributor section on the
 * /create cert form and the /project/new project form.
 *
 *   - `ContributorIdentityField` — compact typeahead bound to
 *     `/api/search-actors`, the same endpoint that powers the
 *     HandleSearch component in groups + endorsements. Renders the
 *     shared `<Input>` so it matches the form's other fields. The
 *     input + dropdown + keyboard + ARIA machinery is the shared
 *     `Combobox` primitive; this surface keeps its own fetch / exclude
 *     filtering / commit-on-Enter / blur-commit behaviour.
 *   - `normalizeIdentity` — strips the leading `@` and trims.
 *   - `isContributorIdentityAcceptable` — empty OR a recognisable
 *     atproto handle / DID.
 *   - `isContributorWeightAcceptable` — empty OR a finite,
 *     non-negative number (decimals fine).
 */

export interface Actor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

export function normalizeIdentity(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed
}

export function isContributorIdentityAcceptable(raw: string): boolean {
  const v = raw.trim()
  if (!v) return true
  return isAtprotoIdentity(normalizeIdentity(v))
}

export function isContributorWeightAcceptable(raw: string): boolean {
  const v = raw.trim()
  if (!v) return true
  // `Number(v)` (not `parseFloat`) so a trailing "10abc" is rejected
  // — parseFloat would silently truncate to 10.
  const n = Number(v)
  return Number.isFinite(n) && n >= 0
}

export interface ContributorIdentityFieldProps {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  idx: number
  /** True when the current value is non-empty AND doesn't normalise
   *  to a recognisable DID or handle. Paints a red border around
   *  the input so the row's invalidity reads at a glance. */
  invalid: boolean
  /** Normalised (lowercased, @-stripped) identities of the OTHER
   *  contributor rows. The typeahead drops matching actors from
   *  its suggestions so the user can't pick someone who's already
   *  on the list; the picker callback also short-circuits when the
   *  chosen actor is in this set. */
  excludeIdentities: Set<string>
  /** Called when the value should be treated as a "committed"
   *  identity — i.e. when the parent should consider this entry
   *  finalised and swap the input out for the read-only contributor
   *  card. Fires on:
   *    - typeahead pick (suggestion click / Enter on focused row)
   *    - bare Enter when the typed value is a valid atproto identity
   *    - blur when the typed value is a valid atproto identity
   *  Does NOT fire on every keystroke — that lets users keep typing
   *  past intermediate states like `alice.so` on the way to
   *  `alice.social` without the parent prematurely committing them
   *  and hiding the input. */
  onCommit?: (identity: string) => void
  /** Called when the typed value is offered as final but isn't a
   *  recognisable handle or DID: blur, or Enter without a pick when
   *  there is no suggestion to take. The parent shows the row's error
   *  from then on (until the next edit), never while the person is
   *  still typing or picking. */
  onCheck?: () => void
  /** Id of the row's error line under the field, while it shows; the
   *  input is described by it. */
  errorId?: string
}

export function ContributorIdentityField({
  value,
  onChange,
  ariaLabel,
  idx,
  invalid,
  excludeIdentities,
  onCommit,
  onCheck,
  errorId,
}: ContributorIdentityFieldProps) {
  const [results, setResults] = useState<Actor[]>([])
  // The text `results` answer (trimmed), so Enter never takes a
  // suggestion that was found for an earlier, shorter query.
  const [resultsFor, setResultsFor] = useState("")
  // Enter on a name (not a handle) while its search is still on the way:
  // settled once the results for that text land.
  const [enterFor, setEnterFor] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSelectedRef = useRef<string>("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      setResultsFor(trimmed)
      setIsOpen(false)
      return
    }
    if (trimmed === lastSelectedRef.current) return
    if (trimmed.startsWith("did:")) {
      setResults([])
      setResultsFor(trimmed)
      setIsOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
          { headers: { Accept: "application/json" } },
        )
        if (res.ok) {
          const data = (await res.json()) as { actors?: Actor[] }
          const actors = data.actors ?? []
          setResults(actors)
          setIsOpen(actors.length > 0)
        } else {
          setResults([])
          setIsOpen(false)
        }
        setResultsFor(trimmed)
      } catch {
        // Search is best-effort; the free-text input still works. No
        // suggestions for this text, so a pending Enter checks it.
        setResults([])
        setIsOpen(false)
        setResultsFor(trimmed)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  const handleSelect = useCallback(
    (actor: Actor) => {
      const h = actor.handle?.toLowerCase() ?? ""
      const d = actor.did?.toLowerCase() ?? ""
      if (
        (h && excludeIdentities.has(h)) ||
        (d && excludeIdentities.has(d))
      ) {
        setIsOpen(false)
        setResults([])
        return
      }
      const picked =
        actor.handle && actor.handle !== actor.did
          ? `@${actor.handle}`
          : actor.did
      lastSelectedRef.current = picked
      onChange(picked)
      setIsOpen(false)
      setResults([])
      onCommit?.(picked)
    },
    [excludeIdentities, onChange, onCommit],
  )

  const visibleResults = useMemo(
    () =>
      results.filter((a) => {
        const h = a.handle?.toLowerCase() ?? ""
        const d = a.did?.toLowerCase() ?? ""
        if (h && excludeIdentities.has(h)) return false
        if (d && excludeIdentities.has(d)) return false
        return true
      }),
    [results, excludeIdentities],
  )

  // Enter on a name: the first suggestion is the one meant (the list is
  // what the person was looking at); with none, the value is checked and
  // its error shows.
  const pickFirstOrCheck = useCallback(() => {
    const first = visibleResults[0]
    if (first) handleSelect(first)
    else onCheck?.()
  }, [visibleResults, handleSelect, onCheck])

  const handleValueChange = useCallback(
    (next: string) => {
      if (next !== lastSelectedRef.current) {
        lastSelectedRef.current = ""
      }
      onChange(next)
    },
    [onChange],
  )

  // Bare Enter without an arrowed-to row. A recognisable DID or handle:
  // "I'm done typing", and the parent swaps the input out for the
  // contributor card. Anything else (a name like "Rosa"): take the first
  // suggestion for that text, waiting for its search if it is still on
  // the way; the error shows only when there is none.
  const handleSubmitNoMatch = useCallback(
    (raw: string) => {
      const v = raw.trim()
      if (!v) return
      if (isContributorIdentityAcceptable(raw)) {
        onCommit?.(v)
        return
      }
      if (resultsFor === v) pickFirstOrCheck()
      else setEnterFor(v)
    },
    [onCommit, resultsFor, pickFirstOrCheck],
  )

  useEffect(() => {
    if (enterFor === null) return
    // Typed on since: that Enter no longer stands.
    if (value.trim() !== enterFor) {
      setEnterFor(null)
      return
    }
    if (resultsFor !== enterFor) return
    setEnterFor(null)
    pickFirstOrCheck()
  }, [enterFor, resultsFor, value, pickFirstOrCheck])

  const handleBlur = useCallback(() => {
    // Blur acts as an implicit commit when the typed value is a
    // recognisable identity — same effect as picking from the
    // typeahead, just without the dropdown round-trip. Empty / not-
    // yet-valid values leave the input mode in place so a half-typed
    // handle (e.g. `alice.so` mid-way to `alice.social`) doesn't
    // commit just because the field briefly matched the handle regex.
    // An unrecognisable value is checked instead, so its error shows.
    const v = value.trim()
    if (!v) return
    if (!isContributorIdentityAcceptable(v)) {
      onCheck?.()
      return
    }
    onCommit?.(v)
  }, [value, onCommit, onCheck])

  return (
    <Combobox<Actor>
      className="create-cert__contrib-id"
      value={value}
      onValueChange={handleValueChange}
      items={visibleResults}
      getItemKey={(actor) => actor.did}
      isLoading={isSearching}
      open={isOpen}
      onOpenChange={setIsOpen}
      onSelect={handleSelect}
      onSubmitNoMatch={handleSubmitNoMatch}
      enableHomeEnd={false}
      // Don't auto-select the first result: bare Enter commits a typed
      // handle via onSubmitNoMatch even when prefix-match results are
      // visible (matches pre-#130 behaviour), and only a name falls back
      // to the first result there. Arrowing into a row still selects it.
      autoHighlight={false}
      escapeStage="close-only"
      liveStatus={null}
      listboxClassName="create-cert__contrib-id-dropdown"
      // The shared <Input> (44px, the form's field chrome); the combobox
      // spreads its value, keyboard and ARIA wiring over these props.
      inputProps={{
        flush: true,
        id: `create-cert-contrib-input-${idx}`,
        "aria-label": ariaLabel,
        // `error` only paints the invalid border in flush mode (and sets
        // aria-invalid); the row shows the message right under the field
        // (`errorId`), which describes the input.
        error: invalid ? "Not a valid handle" : undefined,
        "aria-describedby": invalid ? errorId : undefined,
        placeholder: "Search by name, or type a handle",
        maxLength: 1000,
        onBlur: handleBlur,
        // Always pass the slot (empty while idle) so the input keeps the
        // same wrapper and never remounts, and loses focus, mid-typing.
        trailingIcon: (
          <span className="inline-flex w-4 justify-center">
            {isSearching ? <LoadingSpinner size="sm" /> : null}
          </span>
        ),
      }}
      renderOption={({ item: actor, highlighted, optionId, onHover, onSelect }) => (
        <li
          id={optionId}
          role="option"
          aria-selected={highlighted}
          data-combobox-option
          className={
            highlighted
              ? "create-cert__contrib-id-option create-cert__contrib-id-option--active"
              : "create-cert__contrib-id-option"
          }
          onMouseEnter={onHover}
          onMouseDown={onSelect}
        >
          <span className="create-cert__contrib-id-name">
            {actor.displayName || actor.handle}
          </span>
          <span className="create-cert__contrib-id-handle">
            {actor.handle !== actor.did ? `@${actor.handle}` : actor.did}
          </span>
        </li>
      )}
    />
  )
}
