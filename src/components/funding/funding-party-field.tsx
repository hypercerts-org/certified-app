"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import Combobox from "@/components/ui/combobox"
import { HydratedIdentityRow } from "@/components/explore-page/funding-receipt-parts"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"
import type { FundingParty } from "@/lib/atproto/indexer"

/**
 * One side (`from` / `to`) of a funding receipt. Offers three input modes:
 *
 *   1. Account   — an atproto account, resolved to a DID (shows avatar +
 *                  name, links in the receipt). Maps to `app.certified.defs#did`.
 *   2. Address   — a wallet address. Maps to `#text`; rendered later via
 *                  WalletAddress (ENS resolution).
 *   3. Free text — an arbitrary name / label. Also maps to `#text`.
 *
 * Account mode reuses the `/api/search-actors` typeahead over the shared
 * `Combobox`; picking a result captures its DID, and a typed handle / `did:`
 * is resolved on commit via `/api/resolve-handle`. Address and Free text are
 * plain inputs that differ only in their affordance.
 */

interface Actor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

export interface FundingPartyValue {
  /** The resolved party, or null while empty / unresolved. */
  party: FundingParty
}

export const EMPTY_FUNDING_PARTY: FundingPartyValue = { party: null }

type Mode = "account" | "address" | "freetext"

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed
}

export default function FundingPartyField({
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: FundingPartyValue
  onChange: (next: FundingPartyValue) => void
  /** Accessible label base, e.g. "Recipient". */
  ariaLabel: string
  disabled?: boolean
}) {
  const account = value.party?.kind === "account" ? value.party : null
  const textValue = value.party?.kind === "text" ? value.party.value : ""

  const [mode, setMode] = useState<Mode>(
    value.party?.kind === "text" ? "address" : "account",
  )
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Actor[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced actor search. Skips raw DIDs and sub-2-char queries.
  useEffect(() => {
    if (mode !== "account") return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2 || q.startsWith("did:")) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `/api/search-actors?q=${encodeURIComponent(q)}&limit=8`,
          { headers: { Accept: "application/json" } },
        )
        if (res.ok) {
          const data = (await res.json()) as { actors?: Actor[] }
          const actors = data.actors ?? []
          setResults(actors)
          setOpen(actors.length > 0)
        } else {
          setResults([])
          setOpen(false)
        }
      } catch {
        // Best-effort: the input still works for a typed handle / DID.
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, mode])

  const commitAccount = useCallback(
    (actor: Actor) => {
      onChange({ party: { kind: "account", did: actor.did } })
      setQuery("")
      setResults([])
      setOpen(false)
      setError(null)
    },
    [onChange],
  )

  // Commit a typed value that wasn't picked from the dropdown: a raw DID is
  // taken verbatim; a handle is resolved to a DID via the API.
  const commitTyped = useCallback(
    async (raw: string) => {
      const v = raw.trim()
      if (!v) return
      if (v.startsWith("did:")) {
        onChange({ party: { kind: "account", did: v } })
        setQuery("")
        setOpen(false)
        setError(null)
        return
      }
      const handle = normalizeHandle(v)
      if (!isAtprotoIdentity(handle)) {
        setError("Enter a handle (alice.bsky.social) or a did:… identifier.")
        return
      }
      setResolving(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/resolve-handle?handle=${encodeURIComponent(handle)}`,
          { headers: { Accept: "application/json" } },
        )
        const data = (await res.json().catch(() => ({}))) as {
          did?: string
          error?: string
        }
        if (res.ok && data.did) {
          onChange({ party: { kind: "account", did: data.did } })
          setQuery("")
          setOpen(false)
        } else {
          setError(data.error || "Could not find that account.")
        }
      } catch {
        setError("Could not find that account.")
      } finally {
        setResolving(false)
      }
    },
    [onChange],
  )

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return
      setMode(next)
      setQuery("")
      setResults([])
      setOpen(false)
      setError(null)
      // Account ⇄ text clears the value; address ⇄ freetext keeps the text.
      if (next === "account" || mode === "account") {
        onChange(EMPTY_FUNDING_PARTY)
      }
    },
    [mode, onChange],
  )

  const clearAccount = useCallback(() => {
    onChange(EMPTY_FUNDING_PARTY)
    setError(null)
  }, [onChange])

  const textPlaceholder =
    mode === "address" ? "0x… wallet address" : "Name or label"

  return (
    <div className="funding-party">
      <div
        className="funding-party__modes"
        role="group"
        aria-label={`${ariaLabel} type`}
      >
        <button
          type="button"
          className="funding-party__mode"
          aria-pressed={mode === "account"}
          disabled={disabled}
          onClick={() => switchMode("account")}
        >
          Account
        </button>
        <button
          type="button"
          className="funding-party__mode"
          aria-pressed={mode === "address"}
          disabled={disabled}
          onClick={() => switchMode("address")}
        >
          Address
        </button>
        <button
          type="button"
          className="funding-party__mode"
          aria-pressed={mode === "freetext"}
          disabled={disabled}
          onClick={() => switchMode("freetext")}
        >
          Free text
        </button>
      </div>

      {mode !== "account" ? (
        <input
          type="text"
          className="funding-form__input"
          aria-label={`${ariaLabel} ${mode === "address" ? "address" : "text"}`}
          placeholder={textPlaceholder}
          value={textValue}
          disabled={disabled}
          maxLength={2048}
          onChange={(e) => {
            const v = e.target.value
            onChange({ party: v.trim() ? { kind: "text", value: v } : null })
          }}
        />
      ) : account ? (
        <div className="funding-party__chip">
          <HydratedIdentityRow
            did={account.did}
            noLink
            className="funding-party__chip-identity"
          />
          <button
            type="button"
            className="funding-party__chip-remove"
            aria-label={`Remove ${ariaLabel}`}
            disabled={disabled}
            onClick={clearAccount}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : (
        <Combobox<Actor>
          className="funding-party__search"
          listboxClassName="funding-party__dropdown"
          value={query}
          onValueChange={(next) => {
            setQuery(next)
            if (error) setError(null)
          }}
          items={results}
          getItemKey={(a) => a.did}
          isLoading={searching || resolving}
          open={open}
          onOpenChange={setOpen}
          onSelect={commitAccount}
          onSubmitNoMatch={(raw) => void commitTyped(raw)}
          autoHighlight={false}
          escapeStage="close-only"
          liveStatus={null}
          renderInput={({ ref, onKeyDown, ...rest }) => (
            <input
              ref={ref}
              type="text"
              className="funding-form__input"
              aria-label={`${ariaLabel} account`}
              placeholder="@handle or did:plc:…"
              maxLength={1000}
              disabled={disabled}
              onKeyDown={onKeyDown}
              onBlur={() => {
                if (query.trim()) void commitTyped(query)
              }}
              {...rest}
            />
          )}
          renderOption={({ item: a, highlighted, optionId, onHover, onSelect }) => (
            <li
              id={optionId}
              role="option"
              aria-selected={highlighted}
              data-combobox-option
              className={
                highlighted
                  ? "funding-party__option funding-party__option--active"
                  : "funding-party__option"
              }
              onMouseEnter={onHover}
              onMouseDown={onSelect}
            >
              <span className="funding-party__option-name">
                {a.displayName || a.handle}
              </span>
              <span className="funding-party__option-handle">
                {a.handle !== a.did ? `@${a.handle}` : a.did}
              </span>
            </li>
          )}
        />
      )}

      {error ? (
        <p className="funding-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
