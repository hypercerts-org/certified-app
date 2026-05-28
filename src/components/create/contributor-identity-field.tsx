"use client"

import { useEffect, useRef, useState } from "react"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"

/**
 * Shared building blocks for the contributor section on the
 * /create cert form and the /project/new project form.
 *
 *   - `ContributorIdentityField` — compact typeahead bound to
 *     `/api/search-actors`, the same endpoint that powers the
 *     HandleSearch component in groups + endorsements. Renders as
 *     a `cert-detail__meta-input` so it sits flush in a row
 *     alongside Role + Weight inputs.
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
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen])

  const handleSelect = (actor: Actor) => {
    const h = actor.handle?.toLowerCase() ?? ""
    const d = actor.did?.toLowerCase() ?? ""
    if (
      (h && excludeIdentities.has(h)) ||
      (d && excludeIdentities.has(d))
    ) {
      setIsOpen(false)
      setResults([])
      setFocusedIndex(-1)
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
    setFocusedIndex(-1)
    onCommit?.(picked)
  }

  const visibleResults = results.filter((a) => {
    const h = a.handle?.toLowerCase() ?? ""
    const d = a.did?.toLowerCase() ?? ""
    if (h && excludeIdentities.has(h)) return false
    if (d && excludeIdentities.has(d)) return false
    return true
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen || visibleResults.length === 0) return
      setFocusedIndex((prev) => (prev + 1) % visibleResults.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!isOpen || visibleResults.length === 0) return
      setFocusedIndex((prev) =>
        prev <= 0 ? visibleResults.length - 1 : prev - 1,
      )
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setFocusedIndex(-1)
    } else if (e.key === "Enter") {
      if (focusedIndex >= 0 && focusedIndex < visibleResults.length) {
        e.preventDefault()
        handleSelect(visibleResults[focusedIndex])
      } else if (visibleResults.length === 1) {
        e.preventDefault()
        handleSelect(visibleResults[0])
      } else if (isContributorIdentityAcceptable(value) && value.trim().length > 0) {
        // No dropdown match — but the typed value is a recognisable
        // DID or handle. Treat Enter as "I'm done typing"; the
        // parent swaps the input out for the contributor card.
        e.preventDefault()
        onCommit?.(value.trim())
      }
    }
  }

  const handleBlur = () => {
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
  }

  return (
    <div className="create-cert__contrib-id" ref={containerRef}>
      <input
        type="text"
        className={
          invalid
            ? "cert-detail__meta-input create-cert__contrib-id-input--invalid"
            : "cert-detail__meta-input"
        }
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder="@handle or did:plc:…"
        value={value}
        maxLength={1000}
        autoComplete="off"
        onBlur={handleBlur}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`create-cert-contrib-listbox-${idx}`}
        aria-autocomplete="list"
        aria-activedescendant={
          focusedIndex >= 0
            ? `create-cert-contrib-opt-${idx}-${focusedIndex}`
            : undefined
        }
        onChange={(e) => {
          if (e.target.value !== lastSelectedRef.current) {
            lastSelectedRef.current = ""
          }
          onChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (visibleResults.length > 0) setIsOpen(true)
        }}
      />
      {isSearching ? (
        <span className="create-cert__contrib-id-spinner" aria-hidden />
      ) : null}
      {isOpen && visibleResults.length > 0 ? (
        <ul
          id={`create-cert-contrib-listbox-${idx}`}
          role="listbox"
          className="create-cert__contrib-id-dropdown"
        >
          {visibleResults.map((actor, i) => {
            const isActive = i === focusedIndex
            return (
              <li
                key={actor.did}
                id={`create-cert-contrib-opt-${idx}-${i}`}
                role="option"
                aria-selected={isActive}
                className={
                  isActive
                    ? "create-cert__contrib-id-option create-cert__contrib-id-option--active"
                    : "create-cert__contrib-id-option"
                }
                onMouseEnter={() => setFocusedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(actor)
                }}
              >
                <span className="create-cert__contrib-id-name">
                  {actor.displayName || actor.handle}
                </span>
                <span className="create-cert__contrib-id-handle">
                  {actor.handle !== actor.did
                    ? `@${actor.handle}`
                    : actor.did}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
