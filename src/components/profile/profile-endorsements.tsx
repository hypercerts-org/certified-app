"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useUrlParam } from "@/hooks/use-url-param"
import {
  ArrowUpDown,
  Ban,
  Filter,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useReceivedEndorsements } from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorNamesMap } from "@/hooks/use-author-names-map"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import {
  createEndorsementAward,
  deleteEndorsementAward,
  createResponse,
} from "@/lib/atproto/badges"
import SegmentedControl from "@/components/ui/segmented-control"
import EndorsementLists from "@/components/profile/endorsement-lists"
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
import {
  BulkBar,
  GivenGrid,
  GivenList,
  ReceivedGrid,
  ReceivedList,
  filterAndSortGiven,
  filterAndSortReceived,
  type ResponseFilterKey,
  type SortKey,
} from "@/components/profile/profile-endorsement-views"
import ConfirmDialog from "@/components/ui/confirm-dialog"
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
  // single pass. When the viewer can manage this profile, `given` IS
  // their own endorsement set — no second useGivenEndorsements call
  // (the hook has no cache; each instance re-runs the whole
  // listDefinitions/listAwards/per-definition fan-out).
  const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false)
  const ownAlreadyEndorsedDids = useMemo(
    () =>
      new Set(canManage ? given.endorsements.map((e) => e.subjectDid) : []),
    [canManage, given.endorsements],
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

  // Stable post-write callbacks so the memoized cards/rows don't re-render
  // on every keystroke just because a fresh inline arrow was handed down.
  // `ownStates` is a memoized object and `given.refetch` a stable useCallback,
  // so both handlers keep a constant identity between renders.
  const onReceivedAfterWrite = useCallback(async () => {
    ownStates.invalidate()
    await ownStates.refetch()
  }, [ownStates])
  const givenRefetch = given.refetch
  const onGivenAfterRevoke = useCallback(() => givenRefetch(), [givenRefetch])

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
            onAfterWrite={onReceivedAfterWrite}
          />
        ) : (
          <ReceivedGrid
            visible={visibleReceived}
            total={filteredReceived.length}
            isLoading={received.isLoading}
            error={received.error}
            viewerIsOwner={canManage}
            viewerDid={viewerDid}
            targetDid={manageTargetDid}
            responseFilter={responseFilter}
            resolve={ownStates.resolve}
            allResponses={ownStates.responses}
            onAfterWrite={onReceivedAfterWrite}
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
            onAfterRevoke={onGivenAfterRevoke}
          />
        ) : (
          <GivenGrid
            visible={visibleGiven}
            total={given.endorsements.length}
            isLoading={given.isLoading}
            error={given.error}
            viewerIsOwner={canManage}
            viewerDid={viewerDid}
            targetDid={manageTargetDid}
            onAfterRevoke={onGivenAfterRevoke}
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
