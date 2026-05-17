"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  Check,
  Inbox,
  Search,
  ThumbsUp,
} from "lucide-react"
import { useGivenEndorsements, type GivenEndorsement } from "@/hooks/use-endorsements"
import {
  useReceivedEndorsements,
  type ReceivedEndorsement,
} from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo, type AuthorInfo } from "@/hooks/use-author-info"
import { useAuth } from "@/lib/auth/auth-context"
import { authFetch } from "@/lib/auth/fetch"
import {
  createEndorsementAward,
  deleteEndorsementAward,
} from "@/lib/atproto/badges"
import ResponseMenu from "@/components/badges/response-menu"
import Avatar from "@/components/ui/avatar"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

interface ProfileEndorsementsProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

type SubTab = "received" | "given"

type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

/** Sort options shown in the toolbar. Labels swap between sub-tabs
 *  because A→Z means different things ("Endorser" vs "Recipient"). */
const RECEIVED_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Endorser A → Z" },
  { key: "alpha-desc", label: "Endorser Z → A" },
]

const GIVEN_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Recipient A → Z" },
  { key: "alpha-desc", label: "Recipient Z → A" },
]

/**
 * Endorsements tab on a user profile page. Mirrors the ProfileCerts
 * shape: sub-tabs (Received | Given) + right-aligned toolbar (search
 * + sort) + a grid of uniform-size cards.
 *
 * Read paths (unchanged from the previous design):
 *   - Received — indexer query for badge.award records with
 *     `subject == profileDid`, then a per-issuer PDS check that the
 *     referenced definition is endorsement-typed.
 *   - Given — direct PDS listRecords on the profile's own repo,
 *     filtered to awards whose `badge.uri` points at one of their
 *     endorsement-typed definitions.
 */
export default function ProfileEndorsements({ did }: ProfileEndorsementsProps) {
  const { did: viewerDid } = useAuth()
  const viewerIsOwner = !!viewerDid && viewerDid === did

  const given = useGivenEndorsements(did)
  const received = useReceivedEndorsements(did)
  const ownStates = useOwnResponseStates()

  // Optimistic overlay on the received list so the viewer's own
  // Endorse/Revoke action shows up immediately. The indexer-backed
  // hook caches for 5 min and would otherwise lag. De-dup by URI
  // covers the catch-up moment.
  const [optimisticAdds, setOptimisticAdds] = useState<ReceivedEndorsement[]>([])
  const [optimisticHides, setOptimisticHides] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const displayReceived = useMemo(() => {
    const real = received.endorsements.filter((e) => !optimisticHides.has(e.uri))
    const seen = new Set<string>()
    const merged: ReceivedEndorsement[] = []
    for (const e of [...optimisticAdds, ...real]) {
      if (seen.has(e.uri)) continue
      seen.add(e.uri)
      merged.push(e)
    }
    merged.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    return merged
  }, [received.endorsements, optimisticAdds, optimisticHides])

  const handleEndorsed = useCallback((entry: ReceivedEndorsement) => {
    setOptimisticHides((prev) => {
      if (!prev.has(entry.uri)) return prev
      const next = new Set(prev)
      next.delete(entry.uri)
      return next
    })
    setOptimisticAdds((prev) =>
      prev.some((e) => e.uri === entry.uri) ? prev : [entry, ...prev],
    )
  }, [])

  const handleRevoked = useCallback((uri: string) => {
    setOptimisticAdds((prev) => prev.filter((e) => e.uri !== uri))
    setOptimisticHides((prev) => {
      if (prev.has(uri)) return prev
      const next = new Set(prev)
      next.add(uri)
      return next
    })
  }, [])

  // Toolbar state — default to Received per spec.
  const [tab, setTab] = useState<SubTab>("received")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")
  const [sortOpen, setSortOpen] = useState(false)

  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (sortBtnRef.current?.contains(t)) return
      if (sortMenuRef.current?.contains(t)) return
      setSortOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [sortOpen])

  // The DID set to hydrate names for — issuers for the Received tab,
  // recipients for the Given tab. Sort + search both read from the
  // resolved name map.
  const dids = useMemo(() => {
    if (tab === "received") {
      return Array.from(new Set(displayReceived.map((e) => e.issuerDid)))
    }
    return Array.from(new Set(given.endorsements.map((e) => e.subjectDid)))
  }, [tab, displayReceived, given.endorsements])

  const names = useAuthorNamesMap(dids)

  const receivedCountLabel = formatCount(displayReceived.length)
  const givenCountLabel = formatCount(given.endorsements.length)

  const sortOptions = tab === "received" ? RECEIVED_SORT_OPTIONS : GIVEN_SORT_OPTIONS

  return (
    <div className="profile-endorsements-v2">
      <div className="profile-endorsements-v2__toolbar">
        <nav
          className="profile-endorsements-v2__subtabs"
          role="tablist"
          aria-label="Endorsements sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "received"}
            className={`profile-endorsements-v2__subtab ${
              tab === "received" ? "profile-endorsements-v2__subtab--active" : ""
            }`}
            onClick={() => setTab("received")}
          >
            Received
            {receivedCountLabel ? (
              <span className="profile-endorsements-v2__subtab-count">
                {receivedCountLabel}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "given"}
            className={`profile-endorsements-v2__subtab ${
              tab === "given" ? "profile-endorsements-v2__subtab--active" : ""
            }`}
            onClick={() => setTab("given")}
          >
            Given
            {givenCountLabel ? (
              <span className="profile-endorsements-v2__subtab-count">
                {givenCountLabel}
              </span>
            ) : null}
          </button>
        </nav>

        <div className="profile-endorsements-v2__controls">
          <label className="profile-endorsements-v2__search">
            <Search
              size={16}
              strokeWidth={1.75}
              className="profile-endorsements-v2__search-icon"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search endorsements"
              aria-label="Search endorsements"
              className="profile-endorsements-v2__search-input"
            />
          </label>

          <div className="profile-endorsements-v2__sort-wrap">
            <button
              ref={sortBtnRef}
              type="button"
              className="profile-endorsements-v2__sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-label="Sort endorsements"
              title="Sort"
            >
              <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {sortOpen ? (
              <div
                ref={sortMenuRef}
                className="profile-endorsements-v2__sort-menu"
                role="menu"
              >
                {sortOptions.map((opt) => {
                  const active = opt.key === sort
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className="profile-endorsements-v2__sort-item"
                      onClick={() => {
                        setSort(opt.key)
                        setSortOpen(false)
                      }}
                    >
                      <span className="profile-endorsements-v2__sort-item-check">
                        {active ? <Check size={14} strokeWidth={2} aria-hidden /> : null}
                      </span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {tab === "received" ? (
        <>
          <div className="profile-endorsements-v2__endorse-row">
            <EndorseShortcut
              viewerDid={viewerDid}
              profileDid={did}
              viewerIsOwner={viewerIsOwner}
              onEndorsed={handleEndorsed}
              onRevoked={handleRevoked}
            />
          </div>
          <ReceivedGrid
            endorsements={displayReceived}
            isLoading={received.isLoading}
            error={received.error}
            query={query}
            sort={sort}
            names={names}
            viewerIsOwner={viewerIsOwner}
            viewerDid={viewerDid}
            resolve={ownStates.resolve}
            allResponses={ownStates.responses}
            onAfterWrite={async () => {
              ownStates.invalidate()
              await ownStates.refetch()
            }}
          />
        </>
      ) : (
        <GivenGrid
          endorsements={given.endorsements}
          isLoading={given.isLoading}
          error={given.error}
          query={query}
          sort={sort}
          names={names}
        />
      )}
    </div>
  )
}

function formatCount(n: number): string | null {
  if (n === 0) return null
  return `${n}`
}

// ----------------------------- Received -----------------------------

interface ReceivedGridProps {
  endorsements: ReceivedEndorsement[]
  isLoading: boolean
  error: string | null
  query: string
  sort: SortKey
  names: Map<string, string>
  viewerIsOwner: boolean
  viewerDid: string | null
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}

function ReceivedGrid({
  endorsements,
  isLoading,
  error,
  query,
  sort,
  names,
  viewerIsOwner,
  viewerDid,
  resolve,
  allResponses,
  onAfterWrite,
}: ReceivedGridProps) {
  const visible = useMemo(
    () => filterAndSortReceived(endorsements, query, sort, names),
    [endorsements, query, sort, names],
  )

  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={Inbox}
          title="Couldn’t load endorsements"
          description={error}
        />
      </div>
    )
  }
  if (visible.length === 0) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={ThumbsUp}
          title={endorsements.length === 0 ? "No endorsements yet" : "No matches"}
          description={
            endorsements.length === 0
              ? "Endorsements from other people will appear here."
              : "No endorsements match your search."
          }
        />
      </div>
    )
  }
  return (
    <ul className="profile-endorsements-v2__grid">
      {visible.map((e) => (
        <ReceivedCard
          key={e.uri}
          endorsement={e}
          viewerIsOwner={viewerIsOwner}
          viewerDid={viewerDid}
          resolve={resolve}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ))}
    </ul>
  )
}

function ReceivedCard({
  endorsement,
  viewerIsOwner,
  viewerDid,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  viewerIsOwner: boolean
  viewerDid: string | null
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { info, isLoading } = useAuthorInfo(endorsement.issuerDid)
  return (
    <PersonCard
      did={endorsement.issuerDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={endorsement.createdAt}
      note={endorsement.note}
      menu={
        viewerIsOwner ? (
          <ResponseMenu
            awardUri={endorsement.uri}
            awardCid={endorsement.cid}
            issuerDisplayName={
              info?.displayName || info?.handle || endorsement.issuerDid
            }
            ownerDid={viewerDid}
            state={resolve(endorsement.uri).state}
            allResponses={allResponses}
            onAfterWrite={onAfterWrite}
          />
        ) : null
      }
    />
  )
}

// ------------------------------ Given -------------------------------

interface GivenGridProps {
  endorsements: GivenEndorsement[]
  isLoading: boolean
  error: string | null
  query: string
  sort: SortKey
  names: Map<string, string>
}

function GivenGrid({
  endorsements,
  isLoading,
  error,
  query,
  sort,
  names,
}: GivenGridProps) {
  const visible = useMemo(
    () => filterAndSortGiven(endorsements, query, sort, names),
    [endorsements, query, sort, names],
  )

  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={Inbox}
          title="Couldn’t load endorsements"
          description={error}
        />
      </div>
    )
  }
  if (visible.length === 0) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={ThumbsUp}
          title={endorsements.length === 0 ? "No endorsements given yet" : "No matches"}
          description={
            endorsements.length === 0
              ? "Endorsements this user gives to others will appear here."
              : "No endorsements match your search."
          }
        />
      </div>
    )
  }
  return (
    <ul className="profile-endorsements-v2__grid">
      {visible.map((e) => (
        <GivenCard key={e.uri} endorsement={e} />
      ))}
    </ul>
  )
}

function GivenCard({ endorsement }: { endorsement: GivenEndorsement }) {
  const { info, isLoading } = useAuthorInfo(endorsement.subjectDid)
  return (
    <PersonCard
      did={endorsement.subjectDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={endorsement.createdAt}
      note={endorsement.note}
    />
  )
}

// ---------------------------- Shared card ----------------------------

function PersonCard({
  did,
  info,
  isLoadingInfo,
  createdAt,
  note,
  menu,
}: {
  did: string
  info: AuthorInfo | null
  isLoadingInfo: boolean
  createdAt: string
  note?: string
  menu?: React.ReactNode
}) {
  const displayName = info?.displayName || info?.handle || did
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, did)
  const href = `/profile/${encodeURIComponent(info?.handle || did)}`

  return (
    <li className="profile-endorsements-v2__card">
      <Link href={href} className="profile-endorsements-v2__card-link">
        {isLoadingInfo && !info ? (
          <div
            className="profile-endorsements-v2__card-avatar-skel"
            aria-hidden="true"
          />
        ) : (
          <Avatar
            size="md"
            src={info?.avatarUrl || undefined}
            alt=""
            fallbackInitials={initials}
          />
        )}
        <div className="profile-endorsements-v2__card-body">
          <header className="profile-endorsements-v2__card-id-row">
            <div className="profile-endorsements-v2__card-names">
              <span className="profile-endorsements-v2__card-name">
                {displayName}
              </span>
              {handle ? (
                <span className="profile-endorsements-v2__card-handle">
                  @{handle}
                </span>
              ) : null}
            </div>
            <time
              dateTime={createdAt}
              className="profile-endorsements-v2__card-date"
              title={new Date(createdAt).toLocaleString()}
            >
              {formatShortDate(createdAt)}
            </time>
          </header>
          {note ? (
            <p className="profile-endorsements-v2__card-note">{note}</p>
          ) : null}
        </div>
      </Link>
      {menu ? (
        <div className="profile-endorsements-v2__card-menu">{menu}</div>
      ) : null}
    </li>
  )
}

// ---------------------------- Endorse CTA ----------------------------

/**
 * Endorse / Endorsed button shown on the top-right of the Received
 * tab when the viewer is signed in and is not the profile owner.
 * Behaviour is identical to the previous implementation — only the
 * placement and wrapper class names changed.
 */
function EndorseShortcut({
  viewerDid,
  profileDid,
  viewerIsOwner,
  onEndorsed,
  onRevoked,
}: {
  viewerDid: string | null
  profileDid: string
  viewerIsOwner: boolean
  onEndorsed: (entry: ReceivedEndorsement) => void
  onRevoked: (uri: string) => void
}) {
  const ownGiven = useGivenEndorsements(viewerDid)
  const [isWriting, setIsWriting] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = ownGiven.endorsements.find((e) => e.subjectDid === profileDid)
  const isEndorsed = !!existing

  const handleEndorse = useCallback(async () => {
    if (!viewerDid || isWriting) return
    setIsWriting(true)
    setError(null)
    try {
      const result = await createEndorsementAward(viewerDid, profileDid)
      onEndorsed({
        uri: result.uri,
        cid: result.cid,
        issuerDid: viewerDid,
        createdAt: new Date().toISOString(),
      })
      await ownGiven.refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to endorse")
    } finally {
      setIsWriting(false)
    }
  }, [viewerDid, profileDid, isWriting, ownGiven, onEndorsed])

  const handleConfirmRevoke = useCallback(async () => {
    if (!viewerDid || !existing || isWriting) return
    setIsWriting(true)
    setError(null)
    try {
      const awardUri = existing.uri
      await deleteEndorsementAward(viewerDid, existing.rkey)
      onRevoked(awardUri)
      await ownGiven.refetch()
      setConfirmRevoke(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke endorsement")
    } finally {
      setIsWriting(false)
    }
  }, [viewerDid, existing, isWriting, ownGiven, onRevoked])

  if (!viewerDid || viewerIsOwner) return null

  const onClick = isEndorsed ? () => setConfirmRevoke(true) : handleEndorse

  return (
    <>
      <button
        type="button"
        className={`profile-endorsements-v2__endorse-btn ${
          isEndorsed ? "profile-endorsements-v2__endorse-btn--active" : ""
        }`}
        onClick={onClick}
        disabled={isWriting || ownGiven.isLoading}
        aria-label={isEndorsed ? "Revoke endorsement" : "Endorse this profile"}
      >
        {isEndorsed ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <ThumbsUp size={14} aria-hidden="true" />
        )}
        <span>{isEndorsed ? "Endorsed" : "Endorse"}</span>
      </button>
      {error ? (
        <span className="profile-endorsements-v2__endorse-error" role="alert">
          {error}
        </span>
      ) : null}
      {confirmRevoke ? (
        <ConfirmDialog
          title="Revoke endorsement?"
          message="Your endorsement will be removed from this profile. You can endorse them again later."
          confirmLabel="Revoke"
          cancelLabel="Keep endorsement"
          confirmVariant="destructive"
          isConfirming={isWriting}
          onConfirm={handleConfirmRevoke}
          onCancel={() => !isWriting && setConfirmRevoke(false)}
        />
      ) : null}
    </>
  )
}

// ---------------------- Author-name batch hook ----------------------

/**
 * Resolve a batch of DIDs to display-name-or-handle strings via the
 * same `/api/resolve-did` endpoint `useAuthorInfo` uses, but
 * collected in one place so sort/search can read a synchronous map.
 *
 * Results hydrate over time — the grid re-orders as names land. DIDs
 * that haven't resolved yet fall back to the raw DID for sort
 * comparison, which keeps unresolved items grouped consistently
 * instead of jumping around as each one resolves.
 */
const nameCache = new Map<string, string>()
const namePromises = new Map<string, Promise<string>>()

function fetchName(did: string): Promise<string> {
  const cached = namePromises.get(did)
  if (cached) return cached
  const p = authFetch(`/api/resolve-did?did=${encodeURIComponent(did)}`)
    .then((res) => {
      if (!res.ok) throw new Error("resolve failed")
      return res.json() as Promise<{
        handle?: string
        displayName?: string
      }>
    })
    .then((data) => {
      const name = (data.displayName || data.handle || did).toLowerCase()
      nameCache.set(did, name)
      return name
    })
    .catch(() => {
      // On failure cache the DID itself so we don't retry forever.
      nameCache.set(did, did.toLowerCase())
      return did.toLowerCase()
    })
  namePromises.set(did, p)
  return p
}

function useAuthorNamesMap(dids: string[]): Map<string, string> {
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const missing = dids.filter((d) => !nameCache.has(d))
    if (missing.length === 0) return
    Promise.all(missing.map((d) => fetchName(d))).then(() => {
      if (!cancelled) setTick((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [dids])

  // Return a fresh Map view from the global cache, restricted to the
  // requested DIDs so consumers don't accidentally read stale entries
  // for DIDs not in the current tab.
  return useMemo(() => {
    const out = new Map<string, string>()
    for (const d of dids) {
      out.set(d, nameCache.get(d) ?? d.toLowerCase())
    }
    return out
  }, [dids])
}

// ----------------------- Filter + sort helpers -----------------------

function filterAndSortReceived(
  records: ReceivedEndorsement[],
  query: string,
  sort: SortKey,
  names: Map<string, string>,
): ReceivedEndorsement[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const note = (r.note ?? "").toLowerCase()
        const name = names.get(r.issuerDid) ?? r.issuerDid.toLowerCase()
        return note.includes(q) || name.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareString(b.createdAt, a.createdAt)
      case "created-asc":
        return compareString(a.createdAt, b.createdAt)
      case "alpha-asc":
        return (names.get(a.issuerDid) ?? "").localeCompare(
          names.get(b.issuerDid) ?? "",
        )
      case "alpha-desc":
        return (names.get(b.issuerDid) ?? "").localeCompare(
          names.get(a.issuerDid) ?? "",
        )
    }
  })
  return sorted
}

function filterAndSortGiven(
  records: GivenEndorsement[],
  query: string,
  sort: SortKey,
  names: Map<string, string>,
): GivenEndorsement[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const note = (r.note ?? "").toLowerCase()
        const name = names.get(r.subjectDid) ?? r.subjectDid.toLowerCase()
        return note.includes(q) || name.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareString(b.createdAt, a.createdAt)
      case "created-asc":
        return compareString(a.createdAt, b.createdAt)
      case "alpha-asc":
        return (names.get(a.subjectDid) ?? "").localeCompare(
          names.get(b.subjectDid) ?? "",
        )
      case "alpha-desc":
        return (names.get(b.subjectDid) ?? "").localeCompare(
          names.get(a.subjectDid) ?? "",
        )
    }
  })
  return sorted
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
