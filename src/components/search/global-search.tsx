"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search as SearchIcon, X } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import Avatar from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils/initials"
import { fetchIndexerActivities } from "@/lib/atproto/indexer"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseActivityUri, activityDetailHref } from "@/lib/atproto/activity-uri"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

interface Actor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

interface PersonRow {
  kind: "person"
  actor: Actor
}

interface CertRow {
  kind: "cert"
  record: ActivityRecord
  did: string
}

type Row = PersonRow | CertRow

interface GlobalSearchProps {
  readonly className?: string
  readonly placeholder?: string
  readonly autoFocus?: boolean
}

const SEARCH_DEBOUNCE_MS = 250
const PEOPLE_LIMIT = 6
const CERTS_LIMIT = 6

/**
 * Top-bar global search. Mirrors `people-search` ergonomically but
 * fans out to two sources in parallel:
 *
 *   - `/api/search-actors` for atproto identities (people / orgs)
 *   - Magic Indexer GraphQL for cert (`org.hypercerts.claim.activity`)
 *     full-text matches
 *
 * Results render in two grouped sections in one dropdown
 * ("People" / "Certs"). Arrow keys walk the combined list; Enter
 * activates the highlighted row.
 *
 * Selecting a person navigates to /profile/<did>; selecting a cert
 * navigates to its detail page (/activity/<did>/<rkey>).
 */
export default function GlobalSearch({
  className = "",
  placeholder = "Search Certified",
  autoFocus = false,
}: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [people, setPeople] = useState<Actor[]>([])
  const [certs, setCerts] = useState<CertRow[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  const suppressNextSearchRef = useRef(false)

  // Flat row list used for keyboard nav. Order matches render
  // order: People section first, then Certs. Memoised so the
  // `onEnter` useCallback below isn't invalidated on every render —
  // its `[rows, ...]` dep array would otherwise spawn a new identity
  // each render, breaking downstream memoization.
  const rows: Row[] = useMemo(
    () => [
      ...people.map((actor): PersonRow => ({ kind: "person", actor })),
      ...certs,
    ],
    [people, certs],
  )

  const search = useCallback(async (q: string, seq: number) => {
    const trimmed = q.trim()
    if (trimmed.length < 1) {
      setPeople([])
      setCerts([])
      setIsOpen(false)
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const [peopleRes, certPage] = await Promise.all([
        fetch(
          `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=${PEOPLE_LIMIT}`,
          { headers: { Accept: "application/json" } },
        )
          .then((res) =>
            res.ok
              ? (res.json() as Promise<{ actors?: Actor[] }>)
              : { actors: [] },
          )
          .catch(() => ({ actors: [] as Actor[] })),
        fetchIndexerActivities({
          first: CERTS_LIMIT,
          search: trimmed,
        }).catch(() => null),
      ])

      if (seq !== requestSeq.current) return

      setPeople(peopleRes.actors ?? [])

      const certRows: CertRow[] = []
      if (certPage) {
        for (const record of certPage.records) {
          const did =
            certPage.dids.get(record.uri) ??
            parseActivityUri(record.uri)?.did ??
            ""
          if (!did) continue
          certRows.push({ kind: "cert", record, did })
        }
      }
      setCerts(certRows)

      const total = (peopleRes.actors?.length ?? 0) + certRows.length
      setHighlight(total > 0 ? 0 : -1)
      setIsOpen(true)
    } finally {
      if (seq === requestSeq.current) setIsSearching(false)
    }
  }, [])

  // Debounced search trigger.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }
    if (!query.trim()) {
      setPeople([])
      setCerts([])
      setIsOpen(false)
      setIsSearching(false)
      setHighlight(-1)
      return
    }
    const seq = ++requestSeq.current
    debounceRef.current = setTimeout(
      () => search(query, seq),
      SEARCH_DEBOUNCE_MS,
    )
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  // Close on outside click.
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

  // Cmd/Ctrl+K focus shortcut — same gesture as the old PeopleSearch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return
      const target = e.target
      if (
        target instanceof Element &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target instanceof HTMLElement && target.isContentEditable)) &&
        target !== inputRef.current
      ) {
        return
      }
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [])

  // Keep the highlighted row visible during arrow navigation.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return
    const els = listRef.current.querySelectorAll<HTMLLIElement>(
      "[data-result-row]",
    )
    els[highlight]?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  const select = useCallback(
    (row: Row) => {
      suppressNextSearchRef.current = true
      if (row.kind === "person") {
        setQuery(row.actor.displayName || row.actor.handle)
        router.push(`/profile/${encodeURIComponent(row.actor.did)}`)
      } else {
        setQuery(row.record.value.title || "")
        const href = activityDetailHrefFromRecord(row.record.uri)
        if (href) router.push(href)
      }
      setPeople([])
      setCerts([])
      setIsOpen(false)
      setIsSearching(false)
      setHighlight(-1)
      inputRef.current?.blur()
    },
    [router],
  )

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      setIsOpen(true)
      setHighlight((h) => {
        if (rows.length === 0) return -1
        if (delta === 1) return (h + 1) % rows.length
        return h <= 0 ? rows.length - 1 : h - 1
      })
    },
    [rows.length],
  )

  const onEnter = useCallback(() => {
    if (rows.length === 0) return
    const target = highlight >= 0 ? rows[highlight] : rows[0]
    if (target) select(target)
  }, [rows, highlight, select])

  const onEscape = useCallback(() => {
    if (isOpen) {
      setIsOpen(false)
      return
    }
    if (query) setQuery("")
    else inputRef.current?.blur()
  }, [isOpen, query])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        if (rows.length === 0) return
        e.preventDefault()
        moveHighlight(1)
        return
      case "ArrowUp":
        if (rows.length === 0) return
        e.preventDefault()
        moveHighlight(-1)
        return
      case "Enter":
        if (rows.length === 0) return
        e.preventDefault()
        onEnter()
        return
      case "Escape":
        e.preventDefault()
        onEscape()
        return
      case "Home":
        if (rows.length === 0) return
        e.preventDefault()
        setHighlight(0)
        return
      case "End":
        if (rows.length === 0) return
        e.preventDefault()
        setHighlight(rows.length - 1)
    }
  }

  const handleClear = () => {
    setQuery("")
    setPeople([])
    setCerts([])
    setIsOpen(false)
    setHighlight(-1)
    inputRef.current?.focus()
  }

  const showDropdown =
    isOpen && (isSearching || rows.length > 0 || query.trim().length > 0)

  const listboxId = "global-search-listbox"
  const activeId =
    highlight >= 0 ? `global-search-option-${highlight}` : undefined

  let liveStatus = ""
  if (isSearching) liveStatus = "Searching"
  else if (rows.length > 0)
    liveStatus = `${rows.length} result${rows.length === 1 ? "" : "s"}`
  else if (query.trim()) liveStatus = "No results"

  return (
    <div
      ref={containerRef}
      className={`people-search ${className}`}
      role="search"
    >
      <div className="people-search__field">
        <SearchIcon
          size={16}
          className="people-search__icon"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          className="people-search__input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (rows.length > 0) setIsOpen(true)
          }}
          role="combobox"
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeId}
          autoComplete="off"
          autoFocus={autoFocus}
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="people-search__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {showDropdown && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-busy={isSearching}
          className="people-search__dropdown"
        >
          {isSearching && rows.length === 0 && (
            <li className="people-search__empty">Searching…</li>
          )}
          {!isSearching && rows.length === 0 && query.trim() && (
            <li className="people-search__empty">
              No results for &ldquo;{query.trim()}&rdquo;.
            </li>
          )}

          {/* People section — header + person rows. Both the header
              and the rows are conditional on people.length so we
              don't render an empty "People" header when only certs
              came back. */}
          {people.length > 0 ? (
            <li
              className="cert-search__group-header"
              role="presentation"
              aria-hidden="true"
            >
              People
            </li>
          ) : null}
          {people.map((actor, i) => (
            <PersonRowItem
              key={`p-${actor.did}`}
              actor={actor}
              index={i}
              highlighted={i === highlight}
              onHover={() => setHighlight(i)}
              onSelect={() => select({ kind: "person", actor })}
            />
          ))}

          {/* Certs section — same shape. Header + cert rows, both
              conditional on certs.length. */}
          {certs.length > 0 ? (
            <li
              className="cert-search__group-header"
              role="presentation"
              aria-hidden="true"
            >
              Certs
            </li>
          ) : null}
          {certs.map((row, i) => {
            // Continue the flat-list highlight index past the
            // people section so arrow-key nav matches the visual
            // row order.
            const flatIndex = people.length + i
            return (
              <CertRowItem
                key={`c-${row.record.uri}`}
                record={row.record}
                did={row.did}
                index={flatIndex}
                highlighted={flatIndex === highlight}
                onHover={() => setHighlight(flatIndex)}
                onSelect={() => select(row)}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}

function activityDetailHrefFromRecord(uri: string): string | null {
  const parsed = parseActivityUri(uri)
  if (!parsed) return null
  return activityDetailHref(parsed.did, parsed.rkey)
}

interface PersonRowProps {
  actor: Actor
  index: number
  highlighted: boolean
  onHover: () => void
  onSelect: () => void
}

function PersonRowItem({
  actor,
  index,
  highlighted,
  onHover,
  onSelect,
}: PersonRowProps) {
  const name = actor.displayName || actor.handle
  return (
    <li
      id={`global-search-option-${index}`}
      role="option"
      aria-selected={highlighted}
      data-result-row
      className={`people-search__item ${
        highlighted ? "people-search__item--highlighted" : ""
      }`}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
    >
      <Avatar
        size="sm"
        src={actor.avatar || undefined}
        fallbackInitials={getInitials(name, actor.did)}
        className="shrink-0"
      />
      <div className="people-search__item-info">
        <span className="people-search__item-name">{name}</span>
        <span className="people-search__item-handle">@{actor.handle}</span>
      </div>
    </li>
  )
}

interface CertRowProps {
  record: ActivityRecord
  did: string
  index: number
  highlighted: boolean
  onHover: () => void
  onSelect: () => void
}

function CertRowItem({
  record,
  did,
  index,
  highlighted,
  onHover,
  onSelect,
}: CertRowProps) {
  const { info } = useAuthorInfo(did)
  const imageUrl = record.value.image
    ? resolveActivityImageUrl(record.value.image, did)
    : null
  const title = record.value.title || "Untitled cert"
  const handle = info?.handle ?? null

  return (
      <li
        id={`global-search-option-${index}`}
        role="option"
        aria-selected={highlighted}
        data-result-row
        className={`cert-search__item ${
          highlighted ? "cert-search__item--highlighted" : ""
        }`}
        onMouseEnter={onHover}
        onMouseDown={(e) => {
          e.preventDefault()
          onSelect()
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="cert-search__thumb"
            src={imageUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <div
            className="cert-search__thumb cert-search__thumb--placeholder"
            aria-hidden="true"
          >
            <CertIcon size={16} strokeWidth={1.5} />
          </div>
        )}
        <div className="cert-search__item-info">
          <span className="cert-search__item-title">{title}</span>
          {handle ? (
            <span className="cert-search__item-handle">@{handle}</span>
          ) : null}
        </div>
      </li>
  )
}
