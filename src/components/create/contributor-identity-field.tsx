"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Combobox from "@/components/ui/combobox"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"

/**
 * Shared building blocks for the contributor section on the
 * /create cert form and the /project/new project form.
 *
 *   - `ContributorIdentityField` — compact typeahead bound to
 *     `/api/search-actors`, the same endpoint that powers the
 *     HandleSearch component in groups + endorsements. Renders as
 *     a `cert-detail__meta-input` so it sits flush in a row
 *     alongside Role + Weight inputs. The input + dropdown +
 *     keyboard + ARIA machinery is the shared `Combobox` primitive
 *     (via its bare-input `renderInput` escape hatch); this surface
 *     keeps its own fetch / exclude filtering / commit-on-Enter /
 *     blur-commit behaviour.
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
}

export function ContributorIdentityField({
  value,
  onChange,
  ariaLabel,
  idx,
  invalid,
  excludeIdentities,
  onCommit,
}: ContributorIdentityFieldProps) {
  const [results, setResults] = useState<Actor[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSelectedRef = useRef<string>("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    if (trimmed === lastSelectedRef.current) return
    if (trimmed.startsWith("did:")) {
      setResults([])
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
      } catch {
        // Search is best-effort; the free-text input still works.
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

  const visibleResults = results.filter((a) => {
    const h = a.handle?.toLowerCase() ?? ""
    const d = a.did?.toLowerCase() ?? ""
    if (h && excludeIdentities.has(h)) return false
    if (d && excludeIdentities.has(d)) return false
    return true
  })

  const handleValueChange = useCallback(
    (next: string) => {
      if (next !== lastSelectedRef.current) {
        lastSelectedRef.current = ""
      }
      onChange(next)
    },
    [onChange],
  )

  // Bare Enter with no dropdown match — but the typed value is a
  // recognisable DID or handle. Treat Enter as "I'm done typing"; the
  // parent swaps the input out for the contributor card.
  const handleSubmitNoMatch = useCallback(
    (raw: string) => {
      const v = raw.trim()
      if (isContributorIdentityAcceptable(raw) && v.length > 0) {
        onCommit?.(v)
      }
    },
    [onCommit],
  )

  const handleBlur = useCallback(() => {
    // Blur acts as an implicit commit when the typed value is a
    // recognisable identity — same effect as picking from the
    // typeahead, just without the dropdown round-trip. Empty / not-
    // yet-valid values leave the input mode in place so a half-typed
    // handle (e.g. `alice.so` mid-way to `alice.social`) doesn't
    // commit just because the field briefly matched the handle regex.
    const v = value.trim()
    if (!v) return
    if (!isContributorIdentityAcceptable(v)) return
    onCommit?.(v)
  }, [value, onCommit])

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
      // Don't auto-select the first result: bare Enter commits the typed
      // handle via onSubmitNoMatch even when prefix-match results are
      // visible (matches pre-#130 behaviour). Arrowing into a row still
      // selects it.
      autoHighlight={false}
      escapeStage="close-only"
      liveStatus={null}
      listboxClassName="create-cert__contrib-id-dropdown"
      renderInput={({ ref, onKeyDown, ...rest }) => (
        <>
          <input
            ref={ref}
            type="text"
            id={`create-cert-contrib-input-${idx}`}
            className={
              invalid
                ? "cert-detail__meta-input create-cert__contrib-id-input--invalid"
                : "cert-detail__meta-input"
            }
            aria-label={ariaLabel}
            aria-invalid={invalid}
            placeholder="@handle or did:plc:…"
            maxLength={1000}
            onKeyDown={onKeyDown}
            onBlur={handleBlur}
            {...rest}
          />
          {isSearching ? (
            <span className="create-cert__contrib-id-spinner" aria-hidden />
          ) : null}
        </>
      )}
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
