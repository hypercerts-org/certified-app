"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useUrlParam } from "@/hooks/use-url-param"
import { useClickOutsideClose } from "@/hooks/use-click-outside-close"
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
import { useAuthorNamesMap } from "@/hooks/use-author-names-map"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import {
  createEndorsementAward,
  deleteEndorsementAward,
} from "@/lib/atproto/badges"
import ResponseMenu from "@/components/badges/response-menu"
import EndorsementLists from "@/components/profile/endorsement-lists"
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
import PersonCard from "@/components/profile/person-card"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"

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

  // Acting AS this group: when an owner/admin operates a group (delegation)
  // and is viewing the group's own profile, the GIVE and revoke-given
  // actions author the award on the GROUP's repo via `giveTargetDid`
  // instead of the personal one. The Received-side response controls
  // (accept/reject) stay personal-only for now — group accept/reject is a
  // separate, not-yet-built recipient flow — so they keep `viewerIsOwner`.
  const { activeOrg } = useOrg()
  const actingAsThisGroup = !!activeOrg && activeOrg.groupDid === did
  const canGive = viewerIsOwner || actingAsThisGroup
  const giveTargetDid = actingAsThisGroup ? did : undefined

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
  //
  // Sub-tab is URL-driven via `?sub=received|given` (matches the
  // existing `profile-followers` convention) so a refresh keeps
  // the viewer on the same Given/Received view, and a direct link
  // can deep-link straight into it. Default "received" stays
  // implicit — no `sub=received` in the URL.
  const [subParam, setSubParam] = useUrlParam("sub", { defaultValue: "received" })
  const tab: SubTab = subParam === "given" ? "given" : "received"
  const setTab = useCallback(
    (next: SubTab) => setSubParam(next),
    [setSubParam],
  )
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

  // The optimistic overlay now lives in `useReceivedEndorsements` itself
  // (a shared module store), so `received.endorsements` already reflects
  // the viewer's own Endorse/Revoke action issued from the sidebar — no
  // component-local overlay needed here.
  const displayReceived = received.endorsements

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

  // Endorse-people modal (own-profile only). The viewer can search
  // for one or many people and write a batch of endorsements in a
  // single pass.
  const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false)
  const ownGivenForModal = useGivenEndorsements(
    canGive ? did : null,
  )
  const ownAlreadyEndorsedDids = useMemo(
    () => new Set(ownGivenForModal.endorsements.map((e) => e.subjectDid)),
    [ownGivenForModal.endorsements],
  )

  const sortWrapRef = useRef<HTMLDivElement>(null)
  useClickOutsideClose(sortOpen, sortWrapRef, () => setSortOpen(false))

  // Same outside-click + Escape contract for the response-filter
  // menu — anchored on its own `*__sort-wrap` div so each dropdown's
  // lifecycle is independent.
  const filterWrapRef = useRef<HTMLDivElement>(null)
  useClickOutsideClose(filterOpen, filterWrapRef, () => setFilterOpen(false))

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
          {canGive ? (
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
            <div
              className="profile-endorsements-v2__sort-wrap"
              ref={filterWrapRef}
            >
              <button
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

          <div className="profile-endorsements-v2__sort-wrap" ref={sortWrapRef}>
            <button
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
          viewerIsOwner={canGive}
          viewerDid={viewerDid}
          targetDid={giveTargetDid}
          onAfterRevoke={() => given.refetch()}
        />
      )}

      {isEndorseModalOpen && canGive && viewerDid ? (
        <EndorsePeopleModal
          viewerDid={viewerDid}
          alreadyEndorsedDids={ownAlreadyEndorsedDids}
          requireReason
          onEndorse={(subjectDid, note) =>
            createEndorsementAward(viewerDid, subjectDid, note, {
              targetDid: giveTargetDid,
            })
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
  /** Group DID when the viewer is acting AS this group — revokes route
   *  to the group repo. Undefined for personal revokes. */
  targetDid?: string
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
  targetDid,
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
          targetDid={targetDid}
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
  targetDid,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  canRevoke: boolean
  viewerDid: string | null
  targetDid?: string
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
            targetDid={targetDid}
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
  targetDid,
  subjectDisplay,
  onAfterRevoke,
}: {
  viewerDid: string
  rkey: string
  targetDid?: string
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
      await deleteEndorsementAward(viewerDid, rkey, { targetDid })
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
