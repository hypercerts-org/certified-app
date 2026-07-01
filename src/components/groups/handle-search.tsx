"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, Search, X } from "lucide-react"
import { authFetch } from "@/lib/auth/fetch"
import Avatar from "@/components/ui/avatar"
import Combobox from "@/components/ui/combobox"
import Tooltip from "@/components/ui/tooltip"

interface Actor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

interface HandleSearchProps {
  label?: string
  placeholder?: string
  onSelect: (did: string, handle: string) => void
}

function looksLikeCompleteDid(value: string): boolean {
  const trimmed = value.trim()
  return (trimmed.startsWith("did:plc:") && trimmed.length >= 32) ||
         (trimmed.startsWith("did:web:") && trimmed.length >= 12)
}

/** A full domain-style handle (≥2 dot-separated labels), e.g.
 *  `test002.certified.one`. Used to direct-resolve a handle the actor search
 *  didn't surface (brand-new / unindexed accounts). */
function looksLikeCompleteHandle(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
    value.trim(),
  )
}

export default function HandleSearch({
  label = "Handle",
  placeholder = "Search by handle...",
  onSelect,
}: HandleSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Actor[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  // Holds a resolved DID result shown in the dropdown, waiting for user confirmation
  const [resolvedDid, setResolvedDid] = useState<Actor | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      setResolvedDid(null)
      setIsOpen(false)
      return
    }

    // If it looks like a complete DID, resolve it and show in dropdown
    if (looksLikeCompleteDid(trimmed)) {
      setIsSearching(true)
      setResults([])
      try {
        const res = await authFetch(`/api/resolve-did?did=${encodeURIComponent(trimmed)}`)
        if (res.ok) {
          const data = await res.json()
          const actor: Actor = {
            did: trimmed,
            handle: data.handle || trimmed,
            displayName: "",
            avatar: null,
          }
          setResolvedDid(actor)
          setIsOpen(true)
        }
      } catch {
        // Show the raw DID as a selectable option
        setResolvedDid({ did: trimmed, handle: trimmed, displayName: "", avatar: null })
        setIsOpen(true)
      } finally {
        setIsSearching(false)
      }
      return
    }

    // If it's a partial DID, don't search yet
    if (trimmed.startsWith("did:")) {
      setResults([])
      setResolvedDid(null)
      setIsOpen(false)
      return
    }

    // Regular handle search — /api/search-actors is unauthenticated, use
    // plain fetch so a transient upstream 4xx doesn't trip the global
    // authFetch onUnauthorized -> sign-out interceptor.
    setResolvedDid(null)
    setSearchError(null)
    setIsSearching(true)
    try {
      let actors: Actor[] = []
      let error: string | null = null
      const res = await fetch(
        `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
        { headers: { Accept: "application/json" } }
      )
      if (res.ok) {
        actors = ((await res.json()) as { actors?: Actor[] }).actors ?? []
      } else if (res.status >= 500) {
        // Backend is degraded — surface a hint so the user doesn't think
        // their handle is wrong.
        error = "Search backend is having trouble. Try again in a moment."
      }

      // An exact handle the search didn't surface — e.g. a brand-new account
      // not yet in the appview/indexer (no bsky profile). Resolve it directly,
      // just like a pasted DID, so it's still addable. Clears the error since
      // we found a real match.
      if (
        looksLikeCompleteHandle(trimmed) &&
        !actors.some((a) => a.handle.toLowerCase() === trimmed.toLowerCase())
      ) {
        try {
          const r = await fetch(
            `/api/resolve-handle?handle=${encodeURIComponent(trimmed)}`,
            { headers: { Accept: "application/json" } }
          )
          if (r.ok) {
            const { did } = (await r.json()) as { did?: string }
            if (did) {
              actors = [
                { did, handle: trimmed, displayName: "", avatar: null },
                ...actors,
              ]
              error = null
            }
          }
        } catch {
          // Resolve is best-effort; fall back to whatever search returned.
        }
      }

      setSearchError(error)
      setResults(actors)
      setIsOpen(actors.length > 0 || !!error)
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[handle-search] fetch failed:", err)
      }
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setResolvedDid(null)
      setIsOpen(false)
      return
    }
    const delay = query.trim().startsWith("did:") ? 500 : 300
    debounceRef.current = setTimeout(() => search(query), delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  const handleSelectActor = useCallback(
    (actor: Actor) => {
      setQuery("")
      setIsOpen(false)
      setResults([])
      setResolvedDid(null)
      onSelect(actor.did, actor.handle)
    },
    [onSelect],
  )

  // Items in render order: a single resolved-DID confirmation row when
  // present, otherwise the handle search results. While the error banner
  // is showing the original surfaced the error in place of any results,
  // so we hand the combobox an empty list (the banner renders via
  // renderListHeader).
  const allResults = searchError ? [] : resolvedDid ? [resolvedDid] : results

  return (
    <Combobox<Actor>
      className="handle-search"
      value={query}
      onValueChange={setQuery}
      items={allResults}
      getItemKey={(actor) => actor.did}
      isLoading={isSearching}
      open={isOpen}
      onOpenChange={setIsOpen}
      onSelect={handleSelectActor}
      inputRef={inputRef}
      listboxClassName="handle-search__dropdown"
      enableHomeEnd={false}
      // Don't auto-select the first result: Enter on a visible but
      // un-navigated list should do nothing (matches pre-#130 behaviour).
      autoHighlight={false}
      escapeStage="close-only"
      liveStatus={null}
      inputProps={{
        size: "sm",
        variant: "underline",
        label: label || undefined,
        placeholder,
        "aria-label": label ? undefined : "Search for user",
        leadingIcon: <Search size={16} strokeWidth={1.75} aria-hidden />,
        trailingIcon: isSearching ? (
          <Loader2
            size={14}
            strokeWidth={2}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : undefined,
      }}
      trailingButton={
        !isSearching && query ? (
          <Tooltip label="Clear search">
            <button
              type="button"
              className="handle-search__clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery("")
                setResults([])
                setResolvedDid(null)
                setIsOpen(false)
                inputRef.current?.focus()
              }}
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        ) : undefined
      }
      renderListHeader={
        searchError
          ? () => (
              <li className="handle-search__error" role="status">
                {searchError}
              </li>
            )
          : undefined
      }
      renderOption={({ item: actor, highlighted, optionId, onHover, onSelect }) => (
        <li
          id={optionId}
          role="option"
          aria-selected={highlighted}
          data-combobox-option
          className={`handle-search__item${highlighted ? " handle-search__item--focused" : ""}`}
          onMouseEnter={onHover}
          onMouseDown={onSelect}
        >
          <Avatar
            size="sm"
            src={actor.avatar || undefined}
            fallbackInitials={(actor.displayName || actor.handle).slice(0, 2).toUpperCase()}
          />
          <div className="handle-search__item-info">
            <span className="handle-search__item-name">
              {actor.displayName || actor.handle}
            </span>
            <span className="handle-search__item-handle">
              {actor.handle !== actor.did ? `@${actor.handle}` : actor.did}
            </span>
          </div>
        </li>
      )}
    />
  )
}
