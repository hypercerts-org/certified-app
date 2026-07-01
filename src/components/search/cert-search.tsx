"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search as SearchIcon, X } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import Combobox from "@/components/ui/combobox"
import Tooltip from "@/components/ui/tooltip"
import {
  fetchIndexerActivities,
  fetchUserIndexerActivities,
} from "@/lib/atproto/indexer"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { parseActivityUri } from "@/lib/atproto/activity-uri"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { SEARCH_DEBOUNCE_MS } from "@/lib/search/constants"

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

const SEARCH_PAGE_SIZE = 8
const OWN_SEARCH_PAGE_SIZE = 4

/** Cert search typeahead. Mirrors `people-search.tsx`'s combobox
 *  pattern (keyboard nav, debounce, a11y), but renders cert rows
 *  and optionally surfaces the editor's own certs at the top.
 *
 *  The input + dropdown + keyboard + ARIA machinery is the shared
 *  `Combobox` primitive; this surface keeps its own fetch / merge /
 *  dedupe / Your-vs-Other partition + clearOnSelect behaviour.
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

  const inputRef = useRef<HTMLInputElement>(null)
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

  const handleSelect = useCallback(
    (result: CertSearchResult) => {
      if (clearOnSelect) {
        setQuery("")
        setResults([])
      }
      setIsOpen(false)
      setIsSearching(false)
      onSelect(result)
    },
    [clearOnSelect, onSelect],
  )

  const handleClear = () => {
    setQuery("")
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  // Partition for the rendered listbox — own certs first if any.
  // We render a divider between groups (only when both groups have
  // members) so the "Your certs" framing is visible.
  const ownIdxEnd = results.findIndex((r) => !r.isOwn)
  const dividerAt = ownIdxEnd > 0 ? ownIdxEnd : -1
  const hasOwn = Boolean(prioritizeAuthorDid) && results.some((r) => r.isOwn)

  return (
    <Combobox<CertSearchResult>
      className={`cert-search ${className}`}
      role="search"
      value={query}
      onValueChange={setQuery}
      items={results}
      getItemKey={(result) => result.record.uri}
      isLoading={isSearching}
      open={isOpen}
      onOpenChange={setIsOpen}
      onSelect={handleSelect}
      inputRef={inputRef}
      listboxClassName="cert-search__dropdown"
      liveStatus={{
        searching: "Searching",
        results: (n) => `${n} result${n === 1 ? "" : "s"}`,
        empty: "No activities found",
      }}
      inputProps={{
        size: "md",
        placeholder,
        autoFocus,
        "aria-label": placeholder,
        leadingIcon: <SearchIcon size={16} aria-hidden="true" />,
      }}
      trailingButton={
        query ? (
          <Tooltip label="Clear search">
            <button
              type="button"
              className="cert-search__clear"
              onClick={handleClear}
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : undefined
      }
      renderEmpty={() => {
        if (isSearching) {
          return <li className="cert-search__empty">Searching…</li>
        }
        if (query.trim()) {
          return (
            <li className="cert-search__empty">
              No activities found for &ldquo;{query.trim()}&rdquo;.
            </li>
          )
        }
        return null
      }}
      renderListHeader={
        hasOwn
          ? () => (
              <li
                className="cert-search__group-header"
                role="presentation"
                aria-hidden="true"
              >
                Your activities
              </li>
            )
          : undefined
      }
      renderOption={({ item: result, index, highlighted, optionId, onHover, onSelect }) => (
        <CertSearchRow
          result={result}
          optionId={optionId}
          highlighted={highlighted}
          showOtherHeader={index === dividerAt}
          onHover={onHover}
          onSelect={onSelect}
        />
      )}
    />
  )
}

interface CertSearchRowProps {
  result: CertSearchResult
  optionId: string
  highlighted: boolean
  /** Render the "Other certs" group header above this row (the
   *  first non-own result after a run of own results). */
  showOtherHeader: boolean
  onHover: () => void
  onSelect: (e: React.MouseEvent) => void
}

function CertSearchRow({
  result,
  optionId,
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
        id={optionId}
        role="option"
        aria-selected={highlighted}
        data-combobox-option
        className={`cert-search__item ${
          highlighted ? "cert-search__item--highlighted" : ""
        }`}
        onMouseEnter={onHover}
        onMouseDown={onSelect}
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
