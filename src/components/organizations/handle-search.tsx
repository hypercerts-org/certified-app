"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { authFetch } from "@/lib/auth/fetch"
import Avatar from "@/components/ui/avatar"

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

function isDid(value: string): boolean {
  const trimmed = value.trim()
  return (trimmed.startsWith("did:plc:") && trimmed.length > 12) ||
         (trimmed.startsWith("did:web:") && trimmed.length > 12)
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
  const containerRef = useRef<HTMLDivElement>(null)
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

    // Regular handle search
    setResolvedDid(null)
    setIsSearching(true)
    try {
      const res = await authFetch(
        `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`
      )
      if (res.ok) {
        const data = await res.json()
        setResults(data.actors || [])
        setIsOpen(data.actors?.length > 0)
      }
    } catch {
      // ignore
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
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

  const allResults = resolvedDid ? [resolvedDid] : results

  return (
    <div className="handle-search" ref={containerRef}>
      {label && (
        <label className="handle-search__label">{label}</label>
      )}
      <div className="handle-search__input-wrap">
        <input
          type="text"
          className="handle-search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        {isSearching && (
          <span className="handle-search__spinner" />
        )}
      </div>
      {isOpen && allResults.length > 0 && (
        <div className="handle-search__dropdown">
          {allResults.map((actor) => (
            <button
              key={actor.did}
              className="handle-search__item"
              onClick={() => handleSelectActor(actor)}
              type="button"
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
