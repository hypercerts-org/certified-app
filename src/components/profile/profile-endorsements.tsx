"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  Check,
  Filter,
  Inbox,
  Plus,
  Search,
  ThumbsUp,
  X,
} from "lucide-react"
import { useGivenEndorsements, type GivenEndorsement } from "@/hooks/use-endorsements"
import {
  useReceivedEndorsements,
  type ReceivedEndorsement,
} from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo, type AuthorInfo } from "@/hooks/use-author-info"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { useAuth } from "@/lib/auth/auth-context"
import { authFetch } from "@/lib/auth/fetch"
import {
  createEndorsementAward,
  deleteEndorsementAward,
} from "@/lib/atproto/badges"
import ResponseMenu from "@/components/badges/response-menu"
import EndorsementLists from "@/components/profile/endorsement-lists"
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
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

type ResponseFilterKey = "hide-rejected" | "only-rejected" | "show-all"
const RESPONSE_FILTER_OPTIONS: { key: ResponseFilterKey; label: string }[] = [
  { key: "hide-rejected", label: "Hide rejected" },
  { key: "only-rejected", label: "Show only rejected" },
  { key: "show-all", label: "Show all" },
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
  // Owner-side surfaces see ALL received endorsements (including
  // the rejected ones) so the filter dropdown below can offer
  // "Show only rejected" / "Show all". Foreign viewers stay on the
  // default (rejected filtered out at the hook).
  const received = useReceivedEndorsements(did, {
    includeRejected: viewerIsOwner,
  })
  const ownStates = useOwnResponseStates()

  // Toolbar state — default to Received per spec. Declared up here
  // (above the data memos) because `filteredReceived` reads
  // `responseFilter` and `dids` reads `tab`.
  const [tab, setTab] = useState<SubTab>("received")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")
  const [sortOpen, setSortOpen] = useState(false)
  // Owner-only response filter on the Received sub-tab.
  // `hide-rejected` is the default — rejected entries stay in the
  // underlying data so the user can flip the filter without re-
  // fetching. Foreign viewers never see this control; their hook
  // call doesn't include rejected entries at all (privacy).
  const [responseFilter, setResponseFilter] = useState<
    "hide-rejected" | "only-rejected" | "show-all"
  >("hide-rejected")
  const [filterOpen, setFilterOpen] = useState(false)

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

  // Owner-only response filter on top of `displayReceived`. Foreign
  // viewers fall through with the full list unchanged — their hook
  // call already strips rejected entries server-side via the
  // `includeRejected: false` default. Default = hide rejected.
  const filteredReceived = useMemo(() => {
    if (!viewerIsOwner) return displayReceived
    return displayReceived.filter((e) => {
      const { state } = ownStates.resolve(e.uri)
      if (responseFilter === "show-all") return true
      if (responseFilter === "only-rejected") return state === "rejected"
      return state !== "rejected"
    })
  }, [displayReceived, viewerIsOwner, ownStates, responseFilter])

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

  // Endorse-people modal (own-profile only). The viewer can search
  // for one or many people and write a batch of endorsements in a
  // single pass.
  const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false)
  const ownGivenForModal = useGivenEndorsements(
    viewerIsOwner ? viewerDid : null,
  )
  const ownAlreadyEndorsedDids = useMemo(
    () => new Set(ownGivenForModal.endorsements.map((e) => e.subjectDid)),
    [ownGivenForModal.endorsements],
  )

  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const filterMenuRef = useRef<HTMLDivElement>(null)

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

  // Same outside-click + Escape contract for the response-filter
  // menu. Identical shape to the sort handler — kept as a separate
  // effect so each dropdown's lifecycle is independent.
  useEffect(() => {
    if (!filterOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (filterBtnRef.current?.contains(t)) return
      if (filterMenuRef.current?.contains(t)) return
      setFilterOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [filterOpen])

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
      {/* Lists section is owner-only — per issue #72, foreign
          viewers don't see the list curation UI. Hides the
          create / rename / member-add affordances + the list
          previews themselves when viewing someone else's profile. */}
      {viewerIsOwner ? (
        <EndorsementLists did={did} viewerIsOwner={viewerIsOwner} />
      ) : null}

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
          {viewerIsOwner ? (
            <button
              type="button"
              className="profile-endorsements-v2__endorse-add"
              onClick={() => setIsEndorseModalOpen(true)}
              aria-label="Endorse people"
              title="Endorse people"
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}

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

          {/* Response filter — owner-only, Received sub-tab only.
              Three states: hide rejected (default), show only
              rejected, show all. The underlying data already
              contains rejected entries (the hook was called with
              `includeRejected: true` for owners) so flipping the
              filter is purely client-side. */}
          {viewerIsOwner && tab === "received" ? (
            <div className="profile-endorsements-v2__sort-wrap">
              <button
                ref={filterBtnRef}
                type="button"
                className="profile-endorsements-v2__sort-btn"
                onClick={() => setFilterOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={filterOpen}
                aria-label="Filter endorsements by response"
                title="Filter"
              >
                <Filter size={16} strokeWidth={1.75} aria-hidden />
              </button>
              {filterOpen ? (
                <div
                  ref={filterMenuRef}
                  className="profile-endorsements-v2__sort-menu"
                  role="menu"
                >
                  {RESPONSE_FILTER_OPTIONS.map((opt) => {
                    const active = opt.key === responseFilter
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className="profile-endorsements-v2__sort-item"
                        onClick={() => {
                          setResponseFilter(opt.key)
                          setFilterOpen(false)
                        }}
                      >
                        <span className="profile-endorsements-v2__sort-item-check">
                          {active ? (
                            <Check size={14} strokeWidth={2} aria-hidden />
                          ) : null}
                        </span>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

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
          {/* The Endorse / Endorsed toggle moved to the profile
              sidebar (next to Follow). The optimistic handlers
              (`handleEndorsed` / `handleRevoked`) are still exported
              to the sidebar via the optimistic-overlay state above. */}
          {viewerIsOwner ? (
            <p className="profile-endorsements-v2__response-note">
              Endorsements with no response are shown on your profile by
              default. Rejected endorsements are hidden from your profile.
            </p>
          ) : null}
          <ReceivedGrid
            endorsements={filteredReceived}
            isLoading={received.isLoading}
            error={received.error}
            query={query}
            sort={sort}
            names={names}
            viewerIsOwner={viewerIsOwner}
            viewerDid={viewerDid}
            responseFilter={responseFilter}
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
          viewerIsOwner={viewerIsOwner}
          viewerDid={viewerDid}
          onAfterRevoke={() => given.refetch()}
        />
      )}

      {isEndorseModalOpen && viewerIsOwner && viewerDid ? (
        <EndorsePeopleModal
          viewerDid={viewerDid}
          alreadyEndorsedDids={ownAlreadyEndorsedDids}
          requireReason
          onEndorse={(subjectDid, note) =>
            createEndorsementAward(viewerDid, subjectDid, note)
          }
          onClose={() => setIsEndorseModalOpen(false)}
          onCompleted={async () => {
            // Refresh the Given list so the new endorsements show up
            // on the Given sub-tab the next time the viewer flips to
            // it. The Received list is the OTHER profile's view of
            // its own endorsements — no refresh needed here. Close
            // after the refresh so the user sees the spinner clear.
            setIsEndorseModalOpen(false)
            await ownGivenForModal.refetch()
            await given.refetch()
          }}
        />
      ) : null}
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
  /** Active response filter — used by the empty-state copy so a
   *  zero-results "Show only rejected" view says "No rejected
   *  endorsements yet" instead of the generic "No endorsements
   *  yet." */
  responseFilter: ResponseFilterKey
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
  responseFilter,
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
    // Three empty-state cases:
    //   1. The "Show only rejected" filter is active with no matches
    //      — phrase the empty state in terms of the filter so the
    //      user knows nothing is missing, the filter just has no
    //      hits yet.
    //   2. There's a search query / sort filter but the pre-filter
    //      set is non-empty — "No matches."
    //   3. The user has zero endorsements total — the generic
    //      "No endorsements yet" CTA.
    const onlyRejectedActive = responseFilter === "only-rejected"
    const title = onlyRejectedActive
      ? "No rejected endorsements yet"
      : endorsements.length === 0
        ? "No endorsements yet"
        : "No matches"
    const description = onlyRejectedActive
      ? "Endorsements you reject will appear here."
      : endorsements.length === 0
        ? "Endorsements from other people will appear here."
        : "No endorsements match your search."
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState icon={ThumbsUp} title={title} description={description} />
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
  // Prefer the indexer's denormalised issuer block (magic-indexer #96).
  // Skip the per-row useAuthorInfo fetch when issuer.handle is
  // populated — null passed to useAuthorInfo short-circuits its
  // /api/resolve-did fetch (rule-of-hooks-compliant). Falls back to
  // useAuthorInfo when the indexer hasn't ingested the actor profile
  // yet (graceful-degradation state per #69 H1).
  const idxIssuer = endorsement.issuer
  const skipFetch = !!idxIssuer?.handle
  const { info: fetched, isLoading } = useAuthorInfo(
    skipFetch ? null : endorsement.issuerDid,
  )

  // Compose a final AuthorInfo from indexer fields (preferred) +
  // fetched fallback. PersonCard reads `info.displayName`,
  // `info.handle`, `info.avatarUrl` to render.
  const indexerAvatar = buildAvatarUrlFromCid(
    idxIssuer?.did ?? endorsement.issuerDid,
    idxIssuer?.avatarCid,
  )
  const info: AuthorInfo | null =
    idxIssuer && idxIssuer.handle
      ? {
          did: idxIssuer.did,
          handle: idxIssuer.handle,
          displayName: idxIssuer.displayName,
          avatarUrl: indexerAvatar ?? fetched?.avatarUrl ?? null,
        }
      : fetched

  return (
    <PersonCard
      did={endorsement.issuerDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={endorsement.createdAt}
      note={endorsement.note}
      listTitle={endorsement.listTitle}
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
  /** True when the profile being viewed is the signed-in user's
   *  own profile — i.e. the cards represent endorsements THEY
   *  issued. Controls whether the per-card revoke `×` renders. */
  viewerIsOwner: boolean
  viewerDid: string | null
  onAfterRevoke: () => void | Promise<void>
}

function GivenGrid({
  endorsements,
  isLoading,
  error,
  query,
  sort,
  names,
  viewerIsOwner,
  viewerDid,
  onAfterRevoke,
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
        <GivenCard
          key={e.uri}
          endorsement={e}
          canRevoke={viewerIsOwner && !!viewerDid}
          viewerDid={viewerDid}
          onAfterRevoke={onAfterRevoke}
        />
      ))}
    </ul>
  )
}

function GivenCard({
  endorsement,
  canRevoke,
  viewerDid,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  canRevoke: boolean
  viewerDid: string | null
  onAfterRevoke: () => void | Promise<void>
}) {
  const { info, isLoading } = useAuthorInfo(endorsement.subjectDid)
  return (
    <PersonCard
      did={endorsement.subjectDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={endorsement.createdAt}
      note={endorsement.note}
      listTitle={endorsement.listTitle}
      menu={
        canRevoke && viewerDid ? (
          <RevokeGivenButton
            viewerDid={viewerDid}
            rkey={endorsement.rkey}
            subjectDisplay={
              info?.displayName || info?.handle || endorsement.subjectDid
            }
            onAfterRevoke={onAfterRevoke}
          />
        ) : null
      }
    />
  )
}

/**
 * Small `×` revoke affordance shown on the owner's Given grid.
 * Click → ConfirmDialog ("Revoke endorsement?") → on confirm,
 * `deleteEndorsementAward` runs and the parent's `onAfterRevoke`
 * refetches the Given list so the card disappears.
 */
function RevokeGivenButton({
  viewerDid,
  rkey,
  subjectDisplay,
  onAfterRevoke,
}: {
  viewerDid: string
  rkey: string
  subjectDisplay: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (isRevoking) return
    setIsRevoking(true)
    setError(null)
    try {
      await deleteEndorsementAward(viewerDid, rkey)
      await onAfterRevoke()
      setConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke")
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="profile-endorsements-v2__given-revoke"
        onClick={(e) => {
          // PersonCard's outer Link otherwise catches the click and
          // navigates to the subject's profile.
          e.preventDefault()
          e.stopPropagation()
          setConfirmOpen(true)
        }}
        aria-label={`Revoke endorsement of ${subjectDisplay}`}
        title="Revoke endorsement"
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
      {confirmOpen ? (
        <ConfirmDialog
          title={`Revoke endorsement of ${subjectDisplay}?`}
          message="Your endorsement will be removed from this profile. You can endorse them again later."
          confirmLabel="Revoke"
          cancelLabel="Keep endorsement"
          confirmVariant="destructive"
          isConfirming={isRevoking}
          onConfirm={handleConfirm}
          onCancel={() => !isRevoking && setConfirmOpen(false)}
        />
      ) : null}
      {error ? (
        <span className="profile-endorsements-v2__endorse-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  )
}

// ---------------------------- Shared card ----------------------------

function PersonCard({
  did,
  info,
  isLoadingInfo,
  createdAt,
  note,
  listTitle,
  menu,
}: {
  did: string
  info: AuthorInfo | null
  isLoadingInfo: boolean
  createdAt: string
  note?: string
  /** Optional name of the list this endorsement was awarded under.
   *  When set, renders as a 4th row in the card. Omitted for default
   *  "Endorsement" awards (and for surfaces that ARE a list view,
   *  where the context is implicit). */
  listTitle?: string
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
        {/* Vertical stack — name (row 1), @handle (row 2), date
            (row 3), list name (row 4 when present). The previous
            layout pinned the date to the right of the name; lifting
            it into its own row keeps the card visually scannable
            even when the list-name row appears below it. */}
        <div className="profile-endorsements-v2__card-body">
          <span className="profile-endorsements-v2__card-name">
            {displayName}
          </span>
          {handle ? (
            <span className="profile-endorsements-v2__card-handle">
              @{handle}
            </span>
          ) : null}
          <time
            dateTime={createdAt}
            className="profile-endorsements-v2__card-date"
            title={new Date(createdAt).toLocaleString()}
          >
            {formatShortDate(createdAt)}
          </time>
          {listTitle ? (
            <span
              className="profile-endorsements-v2__card-list"
              title={`From list: ${listTitle}`}
            >
              {listTitle}
            </span>
          ) : null}
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
