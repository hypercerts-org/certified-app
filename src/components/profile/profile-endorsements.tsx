"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useUrlParam } from "@/hooks/use-url-param"
import {
  ArrowUpDown,
  Ban,
  Filter,
  Inbox,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
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
  createResponse,
} from "@/lib/atproto/badges"
import ResponseMenu from "@/components/badges/response-menu"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import SegmentedControl from "@/components/ui/segmented-control"
import { profileUrl } from "@/lib/urls"
import { getInitials } from "@/lib/utils/initials"
import Link from "next/link"
import EndorsementLists from "@/components/profile/endorsement-lists"
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
import PersonCard from "@/components/profile/person-card"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Badge from "@/components/ui/badge"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import Tooltip from "@/components/ui/tooltip"

interface ProfileEndorsementsProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

type SubTab = "received" | "given"
type ViewMode = "gallery" | "list"

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
  // and is viewing the group's own profile, the give, revoke-given, AND
  // received accept/reject actions author the record on the GROUP's repo
  // via `manageTargetDid` instead of the personal one. `canManage` gates
  // every owner-side affordance; foreign viewers (neither owner nor an
  // admin acting as this group) get the read-only view.
  const { activeOrg } = useOrg()
  const actingAsThisGroup = !!activeOrg && activeOrg.groupDid === did
  // Owner-side affordances (give / revoke-given / accept-reject-received).
  // CRITICAL: while delegated (activeOrg set) you must NOT manage your
  // PERSONAL endorsements — that would write to your personal repo while
  // the chrome says you're the org, which is exactly the confusing
  // cross-identity action we forbid. So personal management requires
  // `!activeOrg`; group management requires acting AS the very group whose
  // profile this is. The two are mutually exclusive.
  const canManage = (viewerIsOwner && !activeOrg) || actingAsThisGroup
  const manageTargetDid = actingAsThisGroup ? did : undefined

  const given = useGivenEndorsements(did)
  // Owner-side surfaces see ALL received endorsements (including
  // the rejected ones) so the filter dropdown below can offer
  // "Show only rejected" / "Show all". Foreign viewers stay on the
  // default (rejected filtered out at the hook).
  const received = useReceivedEndorsements(did, {
    includeRejected: canManage,
  })
  // Read the GROUP's responses when acting as it on its own profile, so the
  // Received-tab accept/reject state reflects the group, not the operator.
  const ownStates = useOwnResponseStates(actingAsThisGroup ? did : undefined)

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

  // Gallery (card grid) vs list (compact rows). URL-driven via `?view=`
  // like the explore page; default "gallery". The list view is where
  // multi-select + bulk actions live.
  const [viewParam, setViewParam] = useUrlParam("view", { defaultValue: "gallery" })
  const view: ViewMode = viewParam === "list" ? "list" : "gallery"

  // Multi-select (list view, owner only), keyed by representative award
  // URI. Cleared whenever the sub-tab or view changes so a stale URI from
  // the other tab can't survive into a bulk action.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  useEffect(() => {
    clearSelection()
  }, [tab, view, clearSelection])

  // Bulk action plumbing (owner, list view): a confirm gate for the
  // destructive Given delete, and shared busy/error state.
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

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
    if (!canManage) return displayReceived
    return displayReceived.filter((e) => {
      const { state } = ownStates.resolve(e.uri)
      if (responseFilter === "show-all") return true
      if (responseFilter === "only-rejected") return state === "rejected"
      return state !== "rejected"
    })
  }, [displayReceived, canManage, ownStates, responseFilter])

  // Endorse-people modal (own-profile only). The viewer can search
  // for one or many people and write a batch of endorsements in a
  // single pass.
  const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false)
  const ownGivenForModal = useGivenEndorsements(
    canManage ? did : null,
  )
  const ownAlreadyEndorsedDids = useMemo(
    () => new Set(ownGivenForModal.endorsements.map((e) => e.subjectDid)),
    [ownGivenForModal.endorsements],
  )

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

  // Filtered + sorted lists, computed here so the list view, the
  // select-all checkbox, and the gallery all agree on what's visible.
  const visibleGiven = useMemo(
    () => filterAndSortGiven(given.endorsements, query, sort, names),
    [given.endorsements, query, sort, names],
  )
  const visibleReceived = useMemo(
    () => filterAndSortReceived(filteredReceived, query, sort, names),
    [filteredReceived, query, sort, names],
  )
  const visibleUris =
    tab === "given"
      ? visibleGiven.map((e) => e.uri)
      : visibleReceived.map((e) => e.uri)
  const allSelected =
    visibleUris.length > 0 && visibleUris.every((u) => selected.has(u))

  // Multi-select is owner-only and lives in the list view.
  const selectable = canManage && view === "list"

  const toggleOne = useCallback((uri: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allOn = visibleUris.length > 0 && visibleUris.every((u) => prev.has(u))
      return allOn ? new Set() : new Set(visibleUris)
    })
  }, [visibleUris])

  // Bulk DELETE on Given — revoke every award for each selected recipient
  // (a recipient may have been endorsed more than once; `rkeys` holds all).
  const bulkDeleteGiven = useCallback(async () => {
    if (!viewerDid || bulkBusy) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const targets = given.endorsements.filter((e) => selected.has(e.uri))
      for (const e of targets) {
        for (const rkey of e.rkeys) {
          await deleteEndorsementAward(viewerDid, rkey, { targetDid: manageTargetDid })
        }
      }
      clearSelection()
      setBulkConfirmOpen(false)
      await given.refetch()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to delete endorsements")
    } finally {
      setBulkBusy(false)
    }
  }, [viewerDid, bulkBusy, given, selected, manageTargetDid, clearSelection])

  // Bulk REJECT on Received — you can't delete someone else's award, so
  // "remove from my profile" writes a reject response for each selected.
  const bulkRejectReceived = useCallback(async () => {
    if (!viewerDid || bulkBusy) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const targets = filteredReceived.filter((e) => selected.has(e.uri))
      for (const e of targets) {
        await createResponse(
          viewerDid,
          { uri: e.uri, cid: e.cid },
          "rejected",
          { targetDid: manageTargetDid },
        )
      }
      clearSelection()
      setBulkConfirmOpen(false)
      ownStates.invalidate()
      await ownStates.refetch()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to reject endorsements")
    } finally {
      setBulkBusy(false)
    }
  }, [
    viewerDid,
    bulkBusy,
    filteredReceived,
    selected,
    manageTargetDid,
    clearSelection,
    ownStates,
  ])

  return (
    <Tabs
      value={tab}
      onChange={(v) => setTab(v as SubTab)}
      className="profile-endorsements-v2"
    >
      {/* Lists section is owner-only — per issue #72, foreign
          viewers don't see the list curation UI. Hides the
          create / rename / member-add affordances + the list
          previews themselves when viewing someone else's profile. */}
      {viewerIsOwner && !activeOrg ? (
        <EndorsementLists did={did} viewerIsOwner={viewerIsOwner} />
      ) : null}

      <div className="profile-endorsements-v2__toolbar">
        {/* The .profile-endorsements-v2__toolbar already draws the strip's
            shared bottom border, so drop TabList's own and pin it to the
            toolbar's bottom edge. Count chips use the neutral Badge (muted
            grey) to match the pre-migration pill. */}
        <TabList
          aria-label="Endorsements sections"
          className="border-0 self-end"
        >
          <Tab value="received">
            Received
            {receivedCountLabel ? (
              <Badge variant="count" tone="neutral" compact>
                {receivedCountLabel}
              </Badge>
            ) : null}
          </Tab>
          <Tab value="given">
            Given
            {givenCountLabel ? (
              <Badge variant="count" tone="neutral" compact>
                {givenCountLabel}
              </Badge>
            ) : null}
          </Tab>
        </TabList>

        <div className="profile-endorsements-v2__controls">
          {canManage ? (
            <Tooltip label="Endorse people">
              <button
                type="button"
                className="profile-endorsements-v2__endorse-add"
                onClick={() => setIsEndorseModalOpen(true)}
                aria-label="Endorse people"
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </Tooltip>
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
          {canManage && tab === "received" ? (
            <div className="profile-endorsements-v2__sort-wrap">
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger>
                  <button
                    type="button"
                    className="profile-endorsements-v2__sort-btn"
                    aria-label="Filter endorsements by response"
                    title="Filter"
                  >
                    <Filter size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end">
                  {RESPONSE_FILTER_OPTIONS.map((opt) => (
                    <PopoverItem
                      key={opt.key}
                      selected={opt.key === responseFilter}
                      onClick={() => {
                        setResponseFilter(opt.key)
                        setFilterOpen(false)
                      }}
                    >
                      {opt.label}
                    </PopoverItem>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          ) : null}

          <div className="profile-endorsements-v2__sort-wrap">
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger>
                <button
                  type="button"
                  className="profile-endorsements-v2__sort-btn"
                  aria-label="Sort endorsements"
                  title="Sort"
                >
                  <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end">
                {sortOptions.map((opt) => (
                  <PopoverItem
                    key={opt.key}
                    selected={opt.key === sort}
                    onClick={() => {
                      setSort(opt.key)
                      setSortOpen(false)
                    }}
                  >
                    {opt.label}
                  </PopoverItem>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <SegmentedControl
            className="profile-endorsements-v2__view-toggle"
            aria-label="Endorsements view"
            value={view}
            onValueChange={(v) => setViewParam(v === "list" ? "list" : "gallery")}
            size="sm"
            joined
            shape="square"
            iconOnly
            options={[
              {
                value: "gallery",
                icon: <LayoutGrid size={16} strokeWidth={1.75} />,
                ariaLabel: "Gallery view",
              },
              {
                value: "list",
                icon: <ListIcon size={16} strokeWidth={1.75} />,
                ariaLabel: "List view",
              },
            ]}
          />
        </div>
      </div>

      <TabPanel value="received">
        {canManage ? (
          <p className="profile-endorsements-v2__response-note">
            Endorsements with no response are shown on your profile by
            default. Rejected endorsements are hidden from your profile.
          </p>
        ) : null}
        {selectable ? (
          <BulkBar
            selectedCount={selected.size}
            allSelected={allSelected}
            anyVisible={visibleUris.length > 0}
            onToggleAll={toggleAll}
            actionLabel="Reject selected"
            actionIcon={Ban}
            busy={bulkBusy}
            error={bulkError}
            onAction={() => bulkRejectReceived()}
          />
        ) : null}
        {view === "list" ? (
          <ReceivedList
            visible={visibleReceived}
            total={filteredReceived.length}
            isLoading={received.isLoading}
            error={received.error}
            responseFilter={responseFilter}
            viewerIsOwner={canManage}
            viewerDid={viewerDid}
            targetDid={manageTargetDid}
            resolve={ownStates.resolve}
            allResponses={ownStates.responses}
            selectable={selectable}
            selected={selected}
            onToggleOne={toggleOne}
            onAfterWrite={async () => {
              ownStates.invalidate()
              await ownStates.refetch()
            }}
          />
        ) : (
          <ReceivedGrid
            endorsements={filteredReceived}
            isLoading={received.isLoading}
            error={received.error}
            query={query}
            sort={sort}
            names={names}
            viewerIsOwner={canManage}
            viewerDid={viewerDid}
            targetDid={manageTargetDid}
            responseFilter={responseFilter}
            resolve={ownStates.resolve}
            allResponses={ownStates.responses}
            onAfterWrite={async () => {
              ownStates.invalidate()
              await ownStates.refetch()
            }}
          />
        )}
      </TabPanel>
      <TabPanel value="given">
        {selectable ? (
          <BulkBar
            selectedCount={selected.size}
            allSelected={allSelected}
            anyVisible={visibleUris.length > 0}
            onToggleAll={toggleAll}
            actionLabel="Delete selected"
            actionIcon={Trash2}
            busy={bulkBusy}
            error={bulkError}
            onAction={() => setBulkConfirmOpen(true)}
          />
        ) : null}
        {view === "list" ? (
          <GivenList
            visible={visibleGiven}
            total={given.endorsements.length}
            isLoading={given.isLoading}
            error={given.error}
            viewerIsOwner={canManage}
            viewerDid={viewerDid}
            targetDid={manageTargetDid}
            selectable={selectable}
            selected={selected}
            onToggleOne={toggleOne}
            onAfterRevoke={() => given.refetch()}
          />
        ) : (
          <GivenGrid
            endorsements={given.endorsements}
            isLoading={given.isLoading}
            error={given.error}
            query={query}
            sort={sort}
            names={names}
            viewerIsOwner={canManage}
            viewerDid={viewerDid}
            targetDid={manageTargetDid}
            onAfterRevoke={() => given.refetch()}
          />
        )}
      </TabPanel>

      {bulkConfirmOpen ? (
        <ConfirmDialog
          title={`Delete ${selected.size} endorsement${selected.size === 1 ? "" : "s"}?`}
          message="The selected endorsements will be permanently removed from this profile. You can endorse those accounts again later."
          confirmLabel="Delete"
          cancelLabel="Keep"
          confirmVariant="destructive"
          isConfirming={bulkBusy}
          onConfirm={bulkDeleteGiven}
          onCancel={() => !bulkBusy && setBulkConfirmOpen(false)}
        />
      ) : null}

      {isEndorseModalOpen && canManage && viewerDid ? (
        <EndorsePeopleModal
          viewerDid={viewerDid}
          alreadyEndorsedDids={ownAlreadyEndorsedDids}
          requireReason
          onEndorse={(subjectDid, note) =>
            createEndorsementAward(viewerDid, subjectDid, note, {
              targetDid: manageTargetDid,
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
    </Tabs>
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
  /** Group DID when acting AS this group — accept/reject responses route
   *  to the group's repo. Undefined for personal responses. */
  targetDid?: string
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
  targetDid,
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
          targetDid={targetDid}
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
  targetDid,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { info, isLoading } = useReceivedIssuerInfo(endorsement)

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
            targetDid={targetDid}
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
            rkeys={endorsement.rkeys}
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
  rkeys,
  targetDid,
  subjectDisplay,
  onAfterRevoke,
}: {
  viewerDid: string
  /** All award rkeys for this recipient — revoke removes every one so a
   *  recipient endorsed more than once disappears in a single click. */
  rkeys: string[]
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
      for (const rkey of rkeys) {
        await deleteEndorsementAward(viewerDid, rkey, { targetDid })
      }
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
      <Tooltip label="Revoke endorsement">
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
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </Tooltip>
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

// ----------------------- List view + bulk select -----------------------

/**
 * Compose the issuer's AuthorInfo from the indexer's denormalised block,
 * filling gaps via `useAuthorInfo`. The indexer's `issuer` join can carry
 * a handle WITHOUT a displayName/avatar (certified-only orgs have no
 * bsky-profile join), so we only skip the per-row resolve when the
 * indexer block is complete. Shared by the received card + list row.
 */
function useReceivedIssuerInfo(endorsement: ReceivedEndorsement): {
  info: AuthorInfo | null
  isLoading: boolean
} {
  const idxIssuer = endorsement.issuer
  const indexerAvatar = buildAvatarUrlFromCid(
    idxIssuer?.did ?? endorsement.issuerDid,
    idxIssuer?.avatarCid,
  )
  const indexerComplete = !!(
    idxIssuer?.handle &&
    idxIssuer.displayName &&
    indexerAvatar
  )
  const { info: fetched, isLoading } = useAuthorInfo(
    indexerComplete ? null : endorsement.issuerDid,
  )
  const info: AuthorInfo | null =
    idxIssuer?.handle || idxIssuer?.displayName || indexerAvatar || fetched
      ? {
          did: idxIssuer?.did ?? endorsement.issuerDid,
          handle: idxIssuer?.handle ?? fetched?.handle ?? endorsement.issuerDid,
          displayName: idxIssuer?.displayName ?? fetched?.displayName ?? null,
          avatarUrl: indexerAvatar ?? fetched?.avatarUrl ?? null,
        }
      : fetched
  return { info, isLoading }
}

/** Select-all + bulk-action strip shown above the list view for owners. */
function BulkBar({
  selectedCount,
  allSelected,
  anyVisible,
  onToggleAll,
  actionLabel,
  actionIcon: ActionIcon,
  busy,
  error,
  onAction,
}: {
  selectedCount: number
  allSelected: boolean
  anyVisible: boolean
  onToggleAll: () => void
  actionLabel: string
  actionIcon: LucideIcon
  busy: boolean
  error: string | null
  onAction: () => void
}) {
  return (
    <div
      className="profile-endorsements-v2__bulk-bar"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <Checkbox
        checked={allSelected}
        indeterminate={!allSelected && selectedCount > 0}
        onChange={onToggleAll}
        disabled={!anyVisible}
        aria-label={allSelected ? "Deselect all" : "Select all"}
        label={selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
      />
      <div className="profile-endorsements-v2__bulk-actions">
        {error ? (
          <span className="profile-endorsements-v2__bulk-error" role="alert">
            {error}
          </span>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          onClick={onAction}
          disabled={selectedCount === 0 || busy}
        >
          <ActionIcon size={14} strokeWidth={1.75} aria-hidden />
          {actionLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
      </div>
    </div>
  )
}

/** Shared list-row body: avatar + name/handle/note linking to the profile,
 *  with the date right-aligned. Used by both Given and Received rows. */
function EndorsementRowBody({
  did,
  info,
  createdAt,
  note,
}: {
  did: string
  info: AuthorInfo | null
  createdAt: string
  note?: string
}) {
  const display = info?.displayName || info?.handle || did
  const handle =
    info?.handle && info.handle !== info.did ? `@${info.handle}` : null
  return (
    <Link
      href={profileUrl(info?.handle || did)}
      className="profile-endorsements-v2__row-main"
    >
      <Avatar
        size="sm"
        src={info?.avatarUrl ?? undefined}
        alt=""
        fallbackInitials={getInitials(info?.displayName, did)}
      />
      <span className="profile-endorsements-v2__row-text">
        <span className="profile-endorsements-v2__row-name">{display}</span>
        {handle ? (
          <span className="profile-endorsements-v2__row-handle">{handle}</span>
        ) : null}
        {note ? (
          <span className="profile-endorsements-v2__row-note">{note}</span>
        ) : null}
      </span>
      <time className="profile-endorsements-v2__row-date">
        {createdAt.slice(0, 10)}
      </time>
    </Link>
  )
}

function GivenList({
  visible,
  total,
  isLoading,
  error,
  viewerIsOwner,
  viewerDid,
  targetDid,
  selectable,
  selected,
  onToggleOne,
  onAfterRevoke,
}: {
  visible: GivenEndorsement[]
  total: number
  isLoading: boolean
  error: string | null
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  selectable: boolean
  selected: Set<string>
  onToggleOne: (uri: string) => void
  onAfterRevoke: () => void | Promise<void>
}) {
  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Couldn’t load endorsements" description={error} />
    )
  }
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={ThumbsUp}
        title={total === 0 ? "No endorsements given yet" : "No matches"}
        description={
          total === 0
            ? "Endorsements this user gives to others will appear here."
            : "No endorsements match your search."
        }
      />
    )
  }
  return (
    <ul className="profile-endorsements-v2__list">
      {visible.map((e) => (
        <GivenListRow
          key={e.uri}
          endorsement={e}
          selectable={selectable}
          selected={selected.has(e.uri)}
          onToggle={() => onToggleOne(e.uri)}
          canRevoke={viewerIsOwner && !!viewerDid}
          viewerDid={viewerDid}
          targetDid={targetDid}
          onAfterRevoke={onAfterRevoke}
        />
      ))}
    </ul>
  )
}

function GivenListRow({
  endorsement,
  selectable,
  selected,
  onToggle,
  canRevoke,
  viewerDid,
  targetDid,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  selectable: boolean
  selected: boolean
  onToggle: () => void
  canRevoke: boolean
  viewerDid: string | null
  targetDid?: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const { info } = useAuthorInfo(endorsement.subjectDid)
  const display = info?.displayName || info?.handle || endorsement.subjectDid
  return (
    <li className="profile-endorsements-v2__row" data-selected={selected || undefined}>
      {selectable ? (
        <Checkbox
          className="profile-endorsements-v2__row-check"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select endorsement of ${display}`}
        />
      ) : null}
      <EndorsementRowBody
        did={endorsement.subjectDid}
        info={info}
        createdAt={endorsement.createdAt}
        note={endorsement.note}
      />
      {canRevoke && viewerDid ? (
        <RevokeGivenButton
          viewerDid={viewerDid}
          rkeys={endorsement.rkeys}
          targetDid={targetDid}
          subjectDisplay={display}
          onAfterRevoke={onAfterRevoke}
        />
      ) : null}
    </li>
  )
}

function ReceivedList({
  visible,
  total,
  isLoading,
  error,
  responseFilter,
  viewerIsOwner,
  viewerDid,
  targetDid,
  resolve,
  allResponses,
  selectable,
  selected,
  onToggleOne,
  onAfterWrite,
}: {
  visible: ReceivedEndorsement[]
  total: number
  isLoading: boolean
  error: string | null
  responseFilter: ResponseFilterKey
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  selectable: boolean
  selected: Set<string>
  onToggleOne: (uri: string) => void
  onAfterWrite: () => void | Promise<void>
}) {
  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Couldn’t load endorsements" description={error} />
    )
  }
  if (visible.length === 0) {
    const onlyRejectedActive = responseFilter === "only-rejected"
    return (
      <EmptyState
        icon={ThumbsUp}
        title={
          onlyRejectedActive
            ? "No rejected endorsements yet"
            : total === 0
              ? "No endorsements yet"
              : "No matches"
        }
        description={
          onlyRejectedActive
            ? "Endorsements you reject will appear here."
            : total === 0
              ? "Endorsements from other people will appear here."
              : "No endorsements match your search."
        }
      />
    )
  }
  return (
    <ul className="profile-endorsements-v2__list">
      {visible.map((e) => (
        <ReceivedListRow
          key={e.uri}
          endorsement={e}
          selectable={selectable}
          selected={selected.has(e.uri)}
          onToggle={() => onToggleOne(e.uri)}
          viewerIsOwner={viewerIsOwner}
          viewerDid={viewerDid}
          targetDid={targetDid}
          resolve={resolve}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ))}
    </ul>
  )
}

function ReceivedListRow({
  endorsement,
  selectable,
  selected,
  onToggle,
  viewerIsOwner,
  viewerDid,
  targetDid,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  selectable: boolean
  selected: boolean
  onToggle: () => void
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { info } = useReceivedIssuerInfo(endorsement)
  const display = info?.displayName || info?.handle || endorsement.issuerDid
  return (
    <li
      className="profile-endorsements-v2__row"
      data-selected={selected || undefined}
      data-state={resolve(endorsement.uri).state}
    >
      {selectable ? (
        <Checkbox
          className="profile-endorsements-v2__row-check"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select endorsement from ${display}`}
        />
      ) : null}
      <EndorsementRowBody
        did={endorsement.issuerDid}
        info={info}
        createdAt={endorsement.createdAt}
        note={endorsement.note}
      />
      {viewerIsOwner ? (
        <ResponseMenu
          awardUri={endorsement.uri}
          awardCid={endorsement.cid}
          issuerDisplayName={display}
          ownerDid={viewerDid}
          targetDid={targetDid}
          state={resolve(endorsement.uri).state}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ) : null}
    </li>
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
