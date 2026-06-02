"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search as SearchIcon, X } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import {
  fetchIndexerActivities,
  fetchUserIndexerActivities,
} from "@/lib/atproto/indexer"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseActivityUri } from "@/lib/atproto/activity-uri"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/** Result row shape — the indexer record + the author DID (parsed
 *  from `uri`, since the indexer doesn't always surface it on a
 *  separate field) + a flag for "this is from the prioritized DID,
 *  show it in the Your-certs group". */
export interface CertSearchResult {
  record: ActivityRecord
  did: string
  isOwn: boolean
}

interface CertSearchProps {
  /** Required: called when the user picks a result. The parent
   *  decides what "select" means — navigate to detail, add to a
   *  project's items[], whatever. */
  readonly onSelect: (result: CertSearchResult) => void
  /** When set, certs authored by this DID are listed in a
   *  "Your certs" group at the top of the result dropdown. */
  readonly prioritizeAuthorDid?: string
  /** URIs to hide from the result list (e.g. certs already added to
   *  the project so the picker doesn't show duplicates). */
  readonly excludeUris?: readonly string[]
  /** Placeholder text for the input. */
  readonly placeholder?: string
  /** Class for the outer wrapper — lets the parent apply width /
   *  positioning rules without the component needing to know. */
  readonly className?: string
  /** Auto-focus the input on mount. */
  readonly autoFocus?: boolean
  /** Clear the input after a successful select. Useful for the
   *  add-cert-to-project flow where you want to keep adding more. */
  readonly clearOnSelect?: boolean
}

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_PAGE_SIZE = 8
const OWN_SEARCH_PAGE_SIZE = 4

/** Cert search typeahead. Mirrors `people-search.tsx`'s combobox
 *  pattern (keyboard nav, debounce, a11y), but renders cert rows
 *  and optionally surfaces the editor's own certs at the top.
 *
 *  Reusable: the project edit page uses it to add certs to a
 *  project's items[]; the top-bar global search composes it
 *  alongside people results. Doesn't navigate on its own — the
 *  parent's `onSelect` decides.
 */
export default function CertSearch({
  onSelect,
  prioritizeAuthorDid,
  excludeUris,
  placeholder = "Search activities",
  className = "",
  autoFocus = false,
  clearOnSelect = false,
}: CertSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CertSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Drop stale responses when the user keeps typing.
  const requestSeq = useRef(0)

  // Stable hash of excludeUris so the search effect doesn't re-fire
  // on every parent re-render. (Parent typically passes a fresh
  // array each render — its identity changes but contents don't.)
  const excludeKey = excludeUris ? excludeUris.join("|") : ""
  const excludeSet = useMemo(
    () => new Set(excludeUris ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [excludeKey],
  )

  const search = useCallback(
    async (q: string, seq: number) => {
      const trimmed = q.trim()
      if (trimmed.length < 1) {
        setResults([])
        setIsOpen(false)
        setIsSearching(false)
        return
      }
      setIsSearching(true)
      try {
        // Fan-out: in parallel, fetch the editor's own matching certs
        // (so they bubble to the top) and the global search results.
        // The own-cert query is only run when a DID is provided.
        const [ownPage, globalPage] = await Promise.all([
          prioritizeAuthorDid
            ? fetchUserIndexerActivities(prioritizeAuthorDid, {
                first: OWN_SEARCH_PAGE_SIZE,
                search: trimmed,
                mode: "authored",
              }).catch(() => null)
            : Promise.resolve(null),
          fetchIndexerActivities({
            first: SEARCH_PAGE_SIZE,
            search: trimmed,
          }).catch(() => null),
        ])

        if (seq !== requestSeq.current) return

        const seen = new Set<string>()
        const merged: CertSearchResult[] = []
        const pushFrom = (
          records: ActivityRecord[] | undefined,
          dids: Map<string, string> | undefined,
          isOwn: boolean,
        ) => {
          if (!records) return
          for (const record of records) {
            if (seen.has(record.uri)) continue
            if (excludeSet.has(record.uri)) continue
            const parsed = parseActivityUri(record.uri)
            const did = dids?.get(record.uri) ?? parsed?.did ?? ""
            if (!did) continue
            seen.add(record.uri)
            merged.push({ record, did, isOwn })
          }
        }
        pushFrom(ownPage?.records, ownPage?.dids, true)
        pushFrom(globalPage?.records, globalPage?.dids, false)

        setResults(merged)
        setHighlight(merged.length > 0 ? 0 : -1)
        setIsOpen(true)
      } finally {
        if (seq === requestSeq.current) setIsSearching(false)
      }
    },
    [prioritizeAuthorDid, excludeSet],
  )

  // Debounced search trigger.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
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

  // Keep the highlighted row visible when arrowing through results.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return
    const rows = listRef.current.querySelectorAll<HTMLLIElement>(
      "[data-result-row]",
    )
    rows[highlight]?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  const handleSelect = useCallback(
    (result: CertSearchResult) => {
      if (clearOnSelect) {
        setQuery("")
        setResults([])
      }
      setIsOpen(false)
      setIsSearching(false)
      setHighlight(-1)
      onSelect(result)
    },
    [clearOnSelect, onSelect],
  )

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      setIsOpen(true)
      setHighlight((h) => {
        if (results.length === 0) return -1
        if (delta === 1) return (h + 1) % results.length
        return h <= 0 ? results.length - 1 : h - 1
      })
    },
    [results.length],
  )

  const onEnter = useCallback(() => {
    if (results.length === 0) return
    const target = highlight >= 0 ? results[highlight] : results[0]
    if (target) handleSelect(target)
  }, [results, highlight, handleSelect])

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
        if (results.length === 0) return
        e.preventDefault()
        moveHighlight(1)
        return
      case "ArrowUp":
        if (results.length === 0) return
        e.preventDefault()
        moveHighlight(-1)
        return
      case "Enter":
        if (results.length === 0) return
        e.preventDefault()
        onEnter()
        return
      case "Escape":
        e.preventDefault()
        onEscape()
        return
      case "Home":
        if (results.length === 0) return
        e.preventDefault()
        setHighlight(0)
        return
      case "End":
        if (results.length === 0) return
        e.preventDefault()
        setHighlight(results.length - 1)
    }
  }

  const handleClear = () => {
    setQuery("")
    setResults([])
    setIsOpen(false)
    setHighlight(-1)
    inputRef.current?.focus()
  }

  const showDropdown =
    isOpen && (isSearching || results.length > 0 || query.trim().length > 0)

  const listboxId = "cert-search-listbox"
  const activeId =
    highlight >= 0 ? `cert-search-option-${highlight}` : undefined

  let liveStatus = ""
  if (isSearching) liveStatus = "Searching"
  else if (results.length > 0)
    liveStatus = `${results.length} result${results.length === 1 ? "" : "s"}`
  else if (query.trim()) liveStatus = "No activities found"

  // Partition for the rendered listbox — own certs first if any.
  // We render a divider between groups (only when both groups have
  // members) so the "Your certs" framing is visible.
  const ownIdxEnd = results.findIndex((r) => !r.isOwn)
  const dividerAt = ownIdxEnd > 0 ? ownIdxEnd : -1

  return (
    <div
      ref={containerRef}
      className={`cert-search ${className}`}
      role="search"
    >
      <div className="cert-search__field">
        <SearchIcon
          size={16}
          className="cert-search__icon"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          className="cert-search__input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
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
            className="cert-search__clear"
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
          className="cert-search__dropdown"
        >
          {isSearching && results.length === 0 && (
            <li className="cert-search__empty">Searching…</li>
          )}
          {!isSearching && results.length === 0 && query.trim() && (
            <li className="cert-search__empty">
              No activities found for &ldquo;{query.trim()}&rdquo;.
            </li>
          )}

          {/* "Your certs" header — only when we're prioritizing a DID
              AND we got at least one own result back. */}
          {prioritizeAuthorDid && results.some((r) => r.isOwn) ? (
            <li
              className="cert-search__group-header"
              role="presentation"
              aria-hidden="true"
            >
              Your activities
            </li>
          ) : null}

          {results.map((result, i) => (
            <CertSearchRow
              key={result.record.uri}
              result={result}
              index={i}
              highlighted={i === highlight}
              showOtherHeader={i === dividerAt}
              onHover={() => setHighlight(i)}
              onSelect={() => handleSelect(result)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface CertSearchRowProps {
  result: CertSearchResult
  index: number
  highlighted: boolean
  /** Render the "Other certs" group header above this row (the
   *  first non-own result after a run of own results). */
  showOtherHeader: boolean
  onHover: () => void
  onSelect: () => void
}

function CertSearchRow({
  result,
  index,
  highlighted,
  showOtherHeader,
  onHover,
  onSelect,
}: CertSearchRowProps) {
  const { record, did } = result
  const { info } = useAuthorInfo(did)
  const imageUrl = record.value.image
    ? resolveActivityImageUrl(record.value.image, did)
    : null
  const authorHandle = info?.handle ?? null
  const title = record.value.title || "Untitled activity"

  return (
    <>
      {showOtherHeader ? (
        <li
          className="cert-search__group-header"
          role="presentation"
          aria-hidden="true"
        >
          Other activities
        </li>
      ) : null}
      <li
        id={`cert-search-option-${index}`}
        role="option"
        aria-selected={highlighted}
        data-result-row
        className={`cert-search__item ${
          highlighted ? "cert-search__item--highlighted" : ""
        }`}
        onMouseEnter={onHover}
        onMouseDown={(e) => {
          // mouseDown (not click) — fires before input blur so the
          // dropdown doesn't close before our handler runs.
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
          {authorHandle ? (
            <span className="cert-search__item-handle">@{authorHandle}</span>
          ) : null}
        </div>
      </li>
    </>
  )
}
