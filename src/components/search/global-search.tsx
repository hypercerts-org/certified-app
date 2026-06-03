"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search as SearchIcon, X } from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import Avatar from "@/components/ui/avatar"
import Combobox from "@/components/ui/combobox"
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
 * ("People" / "Activities"). Arrow keys walk the combined list; Enter
 * activates the highlighted row.
 *
 * The input + dropdown + keyboard + ARIA machinery is the shared
 * `Combobox` primitive; this surface keeps its own two-source fetch,
 * the flat People-then-Activities row order, the interleaved group
 * headers, and the Cmd/Ctrl+K focus shortcut.
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

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  const suppressNextSearchRef = useRef(false)

  // Flat row list used for keyboard nav. Order matches render
  // order: People section first, then Certs. Memoised so the
  // `select` useCallback below isn't invalidated on every render —
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
      inputRef.current?.blur()
    },
    [router],
  )

  const handleClear = () => {
    setQuery("")
    setPeople([])
    setCerts([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const peopleCount = people.length

  return (
    <Combobox<Row>
      className={`people-search ${className}`}
      role="search"
      value={query}
      onValueChange={setQuery}
      items={rows}
      getItemKey={(row) =>
        row.kind === "person" ? `p-${row.actor.did}` : `c-${row.record.uri}`
      }
      isLoading={isSearching}
      open={isOpen}
      onOpenChange={setIsOpen}
      onSelect={select}
      inputRef={inputRef}
      listboxClassName="people-search__dropdown"
      liveStatus={{
        searching: "Searching",
        results: (n) => `${n} result${n === 1 ? "" : "s"}`,
        empty: "No results",
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
          <button
            type="button"
            className="people-search__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : undefined
      }
      renderEmpty={() => {
        if (isSearching) {
          return <li className="people-search__empty">Searching…</li>
        }
        if (query.trim()) {
          return (
            <li className="people-search__empty">
              No results for &ldquo;{query.trim()}&rdquo;.
            </li>
          )
        }
        return null
      }}
      renderOption={({ item: row, index, highlighted, optionId, onHover, onSelect }) => {
        if (row.kind === "person") {
          return (
            <>
              {/* People header — interleaved above the first person row.
                  Only rendered when people came back (index 0 is a person
                  iff people.length > 0). */}
              {index === 0 ? (
                <li
                  className="cert-search__group-header"
                  role="presentation"
                  aria-hidden="true"
                >
                  People
                </li>
              ) : null}
              <PersonRowItem
                actor={row.actor}
                optionId={optionId}
                highlighted={highlighted}
                onHover={onHover}
                onSelect={onSelect}
              />
            </>
          )
        }
        return (
          <>
            {/* Activities header — interleaved above the first cert row
                (the row at flat index === people.length). */}
            {index === peopleCount ? (
              <li
                className="cert-search__group-header"
                role="presentation"
                aria-hidden="true"
              >
                Activities
              </li>
            ) : null}
            <CertRowItem
              record={row.record}
              did={row.did}
              optionId={optionId}
              highlighted={highlighted}
              onHover={onHover}
              onSelect={onSelect}
            />
          </>
        )
      }}
    />
  )
}

function activityDetailHrefFromRecord(uri: string): string | null {
  const parsed = parseActivityUri(uri)
  if (!parsed) return null
  return activityDetailHref(parsed.did, parsed.rkey)
}

interface PersonRowProps {
  actor: Actor
  optionId: string
  highlighted: boolean
  onHover: () => void
  onSelect: (e: React.MouseEvent) => void
}

function PersonRowItem({
  actor,
  optionId,
  highlighted,
  onHover,
  onSelect,
}: PersonRowProps) {
  const name = actor.displayName || actor.handle
  return (
    <li
      id={optionId}
      role="option"
      aria-selected={highlighted}
      data-combobox-option
      className={`people-search__item ${
        highlighted ? "people-search__item--highlighted" : ""
      }`}
      onMouseEnter={onHover}
      onMouseDown={onSelect}
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
  optionId: string
  highlighted: boolean
  onHover: () => void
  onSelect: (e: React.MouseEvent) => void
}

function CertRowItem({
  record,
  did,
  optionId,
  highlighted,
  onHover,
  onSelect,
}: CertRowProps) {
  const { info } = useAuthorInfo(did)
  const imageUrl = record.value.image
    ? resolveActivityImageUrl(record.value.image, did)
    : null
  const title = record.value.title || "Untitled activity"
  const handle = info?.handle ?? null

  return (
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
        {handle ? (
          <span className="cert-search__item-handle">@{handle}</span>
        ) : null}
      </div>
    </li>
  )
}
