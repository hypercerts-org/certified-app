"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, Search, X } from "lucide-react"
import { authFetch } from "@/lib/auth/fetch"
import Avatar from "@/components/ui/avatar"
import Input from "@/components/ui/input"

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
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [searchError, setSearchError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Reset focused index when results change
  useEffect(() => {
    setFocusedIndex(-1)
  }, [results, resolvedDid])

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
      const res = await fetch(
        `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
        { headers: { Accept: "application/json" } }
      )
      if (res.ok) {
        const data = (await res.json()) as { actors?: Actor[] }
        const actors = data.actors ?? []
        setResults(actors)
        setIsOpen(actors.length > 0)
      } else if (res.status >= 500) {
        // Backend is degraded — surface a hint so the user doesn't think
        // their handle is wrong.
        setSearchError("Search backend is having trouble. Try again in a moment.")
        setIsOpen(true)
      }
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

  // Close on outside click
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

  const handleSelectActor = (actor: Actor) => {
    setQuery("")
    setIsOpen(false)
    setResults([])
    setResolvedDid(null)
    onSelect(actor.did, actor.handle)
  }

  const allResults = resolvedDid ? [resolvedDid] : results

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen || allResults.length === 0) return
      setFocusedIndex((prev) => (prev + 1) % allResults.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!isOpen || allResults.length === 0) return
      setFocusedIndex((prev) => (prev <= 0 ? allResults.length - 1 : prev - 1))
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setFocusedIndex(-1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (focusedIndex >= 0 && focusedIndex < allResults.length) {
        handleSelectActor(allResults[focusedIndex])
        return
      }
      // If there's a resolved DID waiting, select it
      if (resolvedDid) {
        handleSelectActor(resolvedDid)
        return
      }
      // If there's exactly one search result, select it
      if (results.length === 1) {
        handleSelectActor(results[0])
        return
      }
    }
  }

  return (
    <div className="handle-search" ref={containerRef}>
      <Input
        ref={inputRef}
        type="text"
        size="sm"
        variant="underline"
        label={label || undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label={label ? undefined : "Search for user"}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="handle-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          focusedIndex >= 0 ? `handle-option-${focusedIndex}` : undefined
        }
        leadingIcon={<Search size={16} strokeWidth={1.75} aria-hidden />}
        trailingIcon={
          isSearching ? (
            <Loader2
              size={14}
              strokeWidth={2}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : undefined
        }
        trailingButton={
          !isSearching && query ? (
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
          ) : undefined
        }
      />
      {isOpen && searchError && (
        <div className="handle-search__dropdown" role="status">
          <p className="handle-search__error">{searchError}</p>
        </div>
      )}
      {isOpen && !searchError && allResults.length > 0 && (
        <div className="handle-search__dropdown" role="listbox" id="handle-search-listbox">
          {allResults.map((actor, index) => (
            <button
              key={actor.did}
              className={`handle-search__item${index === focusedIndex ? " handle-search__item--focused" : ""}`}
              onClick={() => handleSelectActor(actor)}
              type="button"
              role="option"
              id={`handle-option-${index}`}
              aria-selected={index === focusedIndex}
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
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
