"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { profileUrl } from "@/lib/urls"
import { useRouter } from "next/navigation"
import {
  Search as SearchIcon,
  X,
  CornerDownLeft,
  FolderGit2,
} from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import Avatar from "@/components/ui/avatar"
import Combobox from "@/components/ui/combobox"
import Tooltip from "@/components/ui/tooltip"
import { getInitials } from "@/lib/utils/initials"
import { accountName } from "@/lib/utils/identity"
import { fetchIndexerActivities } from "@/lib/atproto/indexer"
import { fetchProjects } from "@/lib/atproto/indexer-collections"
import { fetchNetworkActors } from "@/lib/atproto/workspace"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import {
  parseActivityUri,
  parseAtUri,
  activityDetailHref,
} from "@/lib/atproto/activity-uri"
import {
  projectImage,
  projectTitle,
  type CollectionRecord,
} from "@/lib/atproto/collection"
import { recordUrl } from "@/lib/urls"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useOwnerByline } from "@/components/explore-page/use-owner-byline"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { mergePeopleByDid, rankBy } from "@/lib/search/rank"
import { parseSearchIntent, type SearchIntent } from "@/lib/search/parse-search-intent"
import { SEARCH_DEBOUNCE_MS, CANDIDATE_FETCH_SIZE } from "@/lib/search/constants"

/** An account result. `certified`: it has a Certified profile (found in
 *  the network's own index); otherwise it came from the Bluesky AppView
 *  only. Certified accounts may arrive without a handle (the index keeps
 *  the profile, not the handle); the row looks it up. */
export interface SearchAccount {
  did: string
  handle: string | null
  displayName: string
  avatar: string | null
  certified: boolean
}

interface AccountRow {
  kind: "account"
  account: SearchAccount
}

interface CertRow {
  kind: "cert"
  record: ActivityRecord
  did: string
}

interface ProjectRow {
  kind: "project"
  project: CollectionRecord
  did: string
}

interface IntentRow {
  kind: "intent"
  intent: SearchIntent
}

/** The last row: the same search on Explore, with every result. */
interface ExploreRow {
  kind: "explore"
}

type Row = IntentRow | CertRow | ProjectRow | AccountRow | ExploreRow

/** Bluesky AppView actor, as /api/search-actors returns it. */
interface BskyActor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

interface GlobalSearchProps {
  readonly className?: string
  readonly placeholder?: string
  readonly autoFocus?: boolean
  /** Called when a row or Enter navigates (the phone search overlay
   *  closes then, even when only the query string changes). */
  readonly onNavigate?: () => void
}

/** Rows per group. Records lead; accounts are a short group after them. */
const ACTIVITIES_LIMIT = 3
const PROJECTS_LIMIT = 3
const ACCOUNTS_LIMIT = 3
/** Candidates asked of each account source (the Bluesky one is cut to
 *  accounts not already found on Certified). */
const ACCOUNT_CANDIDATES = 6

/**
 * The accounts group: Certified-network accounts first (ranked by how
 * well the name matches), then Bluesky-only accounts to fill the group,
 * never one twice (an account in both sources keeps its Certified profile
 * and borrows the Bluesky handle), at most {@link ACCOUNTS_LIMIT}.
 */
export function mergeAccounts(
  query: string,
  certified: readonly SearchAccount[],
  bluesky: readonly BskyActor[],
  limit = ACCOUNTS_LIMIT,
): SearchAccount[] {
  const ranked = rankBy(query, certified, (a) => ({
    primary: a.displayName,
    secondary: a.handle ?? "",
  }))
  const others = bluesky.map(
    (a): SearchAccount => ({ ...a, certified: false }),
  )
  return mergePeopleByDid(ranked, others).slice(0, limit)
}

/**
 * Top-bar global search. Fans out to four sources in parallel:
 *
 *   - the indexer's activities (`org.hypercerts.claim.activity`) and
 *     projects, full-text
 *   - the indexer's Certified account profiles
 *   - `/api/search-actors` (the public Bluesky AppView), for accounts
 *     not on Certified
 *
 * Results render grouped in one dropdown, the network's own records
 * first: Activities, Projects, then Accounts (Certified accounts before
 * Bluesky-only ones, three at most), and a last row that runs the same
 * search on Explore. Arrow keys walk the combined list and a row is
 * activated by click or Enter once picked; Enter with nothing picked
 * submits the typed query to the Explore page (`/explore?q=…`), where the
 * full results render.
 *
 * The input + dropdown + keyboard + ARIA machinery is the shared
 * `Combobox` primitive; this surface keeps its own fetch, the row order,
 * the interleaved group headers, and the Cmd/Ctrl+K focus shortcut.
 */
export default function GlobalSearch({
  className = "",
  placeholder = "Search Certified",
  autoFocus = false,
  onNavigate,
}: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [accounts, setAccounts] = useState<SearchAccount[]>([])
  const [certs, setCerts] = useState<CertRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [intent, setIntent] = useState<SearchIntent | null>(null)
  // A search has come back (so the Explore row has something to follow).
  const [hasResults, setHasResults] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  const suppressNextSearchRef = useRef(false)

  // Flat row list used for keyboard nav. Order matches render order:
  // the jump row, Activities, Projects, Accounts, then the Explore row.
  // Memoised so the `select` useCallback below isn't invalidated on every
  // render — its `[rows, ...]` dep array would otherwise spawn a new
  // identity each render, breaking downstream memoization.
  const rows: Row[] = useMemo(
    () => [
      ...(intent ? [{ kind: "intent", intent } as IntentRow] : []),
      ...certs,
      ...projects,
      ...accounts.map((account): AccountRow => ({ kind: "account", account })),
      ...(hasResults ? [{ kind: "explore" } as ExploreRow] : []),
    ],
    [intent, certs, projects, accounts, hasResults],
  )

  const clearResults = useCallback(() => {
    setAccounts([])
    setCerts([])
    setProjects([])
    setHasResults(false)
  }, [])

  const search = useCallback(async (q: string, seq: number) => {
    const trimmed = q.trim()
    if (trimmed.length < 1) {
      setAccounts([])
      setCerts([])
      setProjects([])
      setHasResults(false)
      setIntent(null)
      setIsOpen(false)
      setIsSearching(false)
      return
    }
    // Synchronous: if the query is a pasted identifier (at-URI / handle /
    // DID / app URL), offer a direct jump that bypasses the indexer.
    setIntent(parseSearchIntent(trimmed))
    setIsSearching(true)
    try {
      const [bskyRes, certifiedPage, certPage, projectPage] = await Promise.all([
        fetch(
          `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=${ACCOUNT_CANDIDATES}`,
          { headers: { Accept: "application/json" } },
        )
          .then((res) =>
            res.ok
              ? (res.json() as Promise<{ actors?: BskyActor[] }>)
              : { actors: [] },
          )
          .catch(() => ({ actors: [] as BskyActor[] })),
        fetchNetworkActors({
          first: ACCOUNT_CANDIDATES,
          search: trimmed,
        }).catch(() => null),
        // Fetch wide, show narrow: the indexer returns recency order, so
        // we pull a larger candidate set and re-rank by relevance before
        // slicing to the display cap.
        fetchIndexerActivities({
          first: CANDIDATE_FETCH_SIZE,
          search: trimmed,
        }).catch(() => null),
        fetchProjects({
          first: CANDIDATE_FETCH_SIZE,
          search: trimmed,
        }).catch(() => null),
      ])

      if (seq !== requestSeq.current) return

      const certified: SearchAccount[] = (certifiedPage?.actors ?? []).map(
        (a) => ({
          did: a.did,
          handle: null,
          displayName: a.displayName ?? "",
          avatar: a.avatarUrl,
          certified: true,
        }),
      )
      setAccounts(mergeAccounts(trimmed, certified, bskyRes.actors ?? []))

      const projectRows: ProjectRow[] = []
      for (const project of projectPage?.records ?? []) {
        const did = parseAtUri(project.uri)?.did ?? ""
        if (!did) continue
        projectRows.push({ kind: "project", project, did })
      }
      setProjects(
        rankBy(trimmed, projectRows, (row) => ({
          primary: projectTitle(row.project.value),
          secondary:
            typeof row.project.value.shortDescription === "string"
              ? row.project.value.shortDescription
              : "",
        })).slice(0, PROJECTS_LIMIT),
      )

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
      const rankedCerts = rankBy(trimmed, certRows, (row) => ({
        primary: row.record.value.title ?? "",
        secondary: row.record.value.shortDescription ?? "",
      })).slice(0, ACTIVITIES_LIMIT)
      setCerts(rankedCerts)
      setHasResults(true)
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
      setAccounts([])
      setCerts([])
      setProjects([])
      setHasResults(false)
      setIntent(null)
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

  // Focus shortcuts: Cmd/Ctrl+K (the old PeopleSearch gesture) and a bare
  // `/` (GitHub, Bluesky). Neither fires while typing in another field;
  // `/` also stays a plain character inside the search field itself, and
  // only the visible field responds (the bar is display:none on phones).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
      const isSlash =
        e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      if (!isModK && !isSlash) return
      const input = inputRef.current
      if (!input || input.getClientRects().length === 0) return
      const target = e.target
      const typing =
        target instanceof Element &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target instanceof HTMLElement && target.isContentEditable))
      if (typing && (isSlash || target !== input)) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [])

  const select = useCallback(
    (row: Row) => {
      suppressNextSearchRef.current = true
      if (row.kind === "intent") {
        router.push(row.intent.href)
      } else if (row.kind === "explore") {
        // Keep the query in the field: it is what Explore searches.
        const q = query.trim()
        router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore")
      } else if (row.kind === "account") {
        setQuery(row.account.displayName || row.account.handle || "")
        router.push(profileUrl(row.account.did))
      } else if (row.kind === "project") {
        setQuery(projectTitle(row.project.value))
        const parsed = parseAtUri(row.project.uri)
        if (parsed) router.push(recordUrl(parsed.did, "project", parsed.rkey))
      } else {
        setQuery(row.record.value.title || "")
        const href = activityDetailHrefFromRecord(row.record.uri)
        if (href) router.push(href)
      }
      clearResults()
      setIntent(null)
      setIsOpen(false)
      setIsSearching(false)
      inputRef.current?.blur()
      onNavigate?.()
    },
    [router, onNavigate, query, clearResults],
  )

  const handleClear = () => {
    setQuery("")
    clearResults()
    setIntent(null)
    setIsOpen(false)
    inputRef.current?.focus()
  }

  // Enter submits the typed query to the full Explore results page
  // (seeded via `?q=`), rather than activating a dropdown row. Typing
  // still shows the live dropdown; clicking a row still deep-links to
  // that person/activity. A blank Enter opens Explore unfiltered.
  const handleSubmitQuery = useCallback(
    (raw: string) => {
      const q = raw.trim()
      clearResults()
      setIsOpen(false)
      setIsSearching(false)
      setIntent(null)
      inputRef.current?.blur()
      // Blank query → just open Explore so the user can browse.
      if (!q) {
        router.push("/explore")
        onNavigate?.()
        return
      }
      // A pasted identifier jumps straight to its target (bypassing the
      // indexer); anything else runs a full Explore search.
      const jump = parseSearchIntent(q)
      router.push(jump ? jump.href : `/explore?q=${encodeURIComponent(q)}`)
      onNavigate?.()
    },
    [router, onNavigate, clearResults],
  )

  // Section offsets for interleaved group headers. The optional intent
  // row sits at index 0; the groups follow it in order.
  const certsStart = intent ? 1 : 0
  const projectsStart = certsStart + certs.length
  const accountsStart = projectsStart + projects.length
  const resultCount = certs.length + projects.length + accounts.length

  return (
    <Combobox<Row>
      className={`people-search ${className}`}
      role="search"
      value={query}
      onValueChange={setQuery}
      items={rows}
      getItemKey={(row) =>
        row.kind === "intent"
          ? "intent"
          : row.kind === "explore"
            ? "explore"
            : row.kind === "account"
              ? `a-${row.account.did}`
              : row.kind === "project"
                ? `p-${row.project.uri}`
                : `c-${row.record.uri}`
      }
      isLoading={isSearching}
      open={isOpen}
      onOpenChange={setIsOpen}
      onSelect={select}
      onSubmit={handleSubmitQuery}
      // Nothing is picked until you arrow to (or point at) a row, so Enter
      // searches Explore by default and opens the row you picked.
      autoHighlight={false}
      submitOnEmpty
      inputRef={inputRef}
      listboxClassName="people-search__dropdown"
      liveStatus={{
        searching: "Searching",
        // The Explore row is a way on, not a result.
        results: () =>
          `${resultCount} result${resultCount === 1 ? "" : "s"}`,
        empty: "No results",
      }}
      inputProps={{
        size: "sm",
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
              className="people-search__clear"
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
          return <li className="people-search__empty">Searching…</li>
        }
        if (query.trim()) {
          return (
            <li className="people-search__empty">
              No results for &quot;{query.trim()}&quot;.
            </li>
          )
        }
        return null
      }}
      renderOption={({ item: row, index, highlighted, optionId, onHover, onSelect }) => {
        if (row.kind === "intent") {
          // Pinned "Jump to" row at index 0 — a direct, indexer-bypassing
          // navigation for a pasted identifier.
          return (
            <IntentRowItem
              intent={row.intent}
              optionId={optionId}
              highlighted={highlighted}
              onHover={onHover}
              onSelect={onSelect}
            />
          )
        }
        if (row.kind === "explore") {
          // The way on: the same search on Explore, every result. When the
          // search found nothing, one muted line says so above it (the
          // live region already announces "0 results").
          return (
            <>
              {resultCount === 0 && !intent ? (
                <li
                  className="people-search__empty people-search__no-match"
                  role="presentation"
                  aria-hidden="true"
                >
                  No activities, projects or accounts match.
                </li>
              ) : null}
              <ExploreRowItem
                query={query.trim()}
                optionId={optionId}
                highlighted={highlighted}
                onHover={onHover}
                onSelect={onSelect}
              />
            </>
          )
        }
        if (row.kind === "account") {
          return (
            <>
              {index === accountsStart ? (
                <GroupHeader label="Accounts" />
              ) : null}
              <AccountRowItem
                account={row.account}
                optionId={optionId}
                highlighted={highlighted}
                onHover={onHover}
                onSelect={onSelect}
              />
            </>
          )
        }
        if (row.kind === "project") {
          return (
            <>
              {index === projectsStart ? (
                <GroupHeader label="Projects" />
              ) : null}
              <ProjectRowItem
                project={row.project}
                did={row.did}
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
            {index === certsStart ? <GroupHeader label="Activities" /> : null}
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

/** A group's header, interleaved above its first row. */
function GroupHeader({ label }: { label: string }) {
  return (
    <li
      className="cert-search__group-header"
      role="presentation"
      aria-hidden="true"
    >
      {label}
    </li>
  )
}

function activityDetailHrefFromRecord(uri: string): string | null {
  const parsed = parseActivityUri(uri)
  if (!parsed) return null
  return activityDetailHref(parsed.did, parsed.rkey)
}

interface IntentRowProps {
  intent: SearchIntent
  optionId: string
  highlighted: boolean
  onHover: () => void
  onSelect: (e: React.MouseEvent) => void
}

function IntentRowItem({
  intent,
  optionId,
  highlighted,
  onHover,
  onSelect,
}: IntentRowProps) {
  const detail = intent.kind === "profile" ? intent.actor : intent.href
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
      <div
        className="cert-search__thumb cert-search__thumb--placeholder"
        aria-hidden="true"
      >
        <CornerDownLeft size={16} strokeWidth={1.5} />
      </div>
      <div className="cert-search__item-info">
        <span className="cert-search__item-title">{intent.label}</span>
        <span className="cert-search__item-handle">{detail}</span>
      </div>
    </li>
  )
}

interface RowItemProps {
  optionId: string
  highlighted: boolean
  onHover: () => void
  onSelect: (e: React.MouseEvent) => void
}

function AccountRowItem({
  account,
  optionId,
  highlighted,
  onHover,
  onSelect,
}: RowItemProps & { account: SearchAccount }) {
  // A Certified account arrives without its handle: look it up.
  const { info } = useAuthorInfo(account.handle ? null : account.did)
  const handle =
    account.handle ??
    (info?.handle && info.handle !== account.did ? info.handle : null)
  const { name, fallback } = accountName(
    account.displayName || info?.displayName,
    handle,
    account.did,
  )
  const avatar = account.avatar || info?.avatarUrl || null
  const initials = getInitials(fallback ? null : name, handle)
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
        src={avatar || undefined}
        fallbackInitials={initials === "?" ? "" : initials}
        seed={account.did}
        className="shrink-0"
      />
      <div className="people-search__item-info">
        <span className="people-search__item-name">{name}</span>
        {handle ? (
          <span className="people-search__item-handle">@{handle}</span>
        ) : null}
      </div>
    </li>
  )
}

function ProjectRowItem({
  project,
  did,
  optionId,
  highlighted,
  onHover,
  onSelect,
}: RowItemProps & { project: CollectionRecord; did: string }) {
  const raw = projectImage(project.value, "thumb")
  const imageUrl = raw ? resolveActivityImageUrl(raw, did) : null
  const owner = useOwnerByline(did)
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
        <img className="cert-search__thumb" src={imageUrl} alt="" loading="lazy" />
      ) : (
        <div
          className="cert-search__thumb cert-search__thumb--placeholder"
          aria-hidden="true"
        >
          <FolderGit2 size={16} strokeWidth={1.5} />
        </div>
      )}
      <div className="cert-search__item-info">
        <span className="cert-search__item-title">
          {projectTitle(project.value)}
        </span>
        {owner ? <span className="cert-search__item-handle">{owner}</span> : null}
      </div>
    </li>
  )
}

function ExploreRowItem({
  query,
  optionId,
  highlighted,
  onHover,
  onSelect,
}: RowItemProps & { query: string }) {
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
      <div
        className="cert-search__thumb cert-search__thumb--placeholder"
        aria-hidden="true"
      >
        <SearchIcon size={16} strokeWidth={1.5} />
      </div>
      <div className="cert-search__item-info">
        <span className="cert-search__item-title">
          Search Explore for &quot;{query}&quot;
        </span>
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
  const imageUrl = record.value.image
    ? resolveActivityImageUrl(record.value.image, did)
    : null
  const title = record.value.title || "Untitled activity"
  const owner = useOwnerByline(did)

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
        {owner ? <span className="cert-search__item-handle">{owner}</span> : null}
      </div>
    </li>
  )
}
