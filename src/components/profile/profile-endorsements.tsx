"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useUrlParam } from "@/hooks/use-url-param"
import { Ban, Plus, Trash2 } from "lucide-react"
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
import EndorsePeopleModal from "@/components/profile/endorse-people-modal"
import {
  BulkBar,
  GivenList,
  ReceivedList,
  filterAndSortGiven,
  filterAndSortReceived,
  type ResponseFilterKey,
  type SortKey,
} from "@/components/profile/profile-endorsement-views"
import {
  PANEL_SEARCH_MIN,
  PanelMenu,
  PanelTools,
  type SortOption,
} from "@/components/profile/profile-panel"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"

interface ProfileEndorsementsProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

type SubTab = "received" | "given"

/** Sort options; A to Z names the endorser or the recipient by sub-tab. */
const RECEIVED_SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Endorser A to Z" },
  { key: "alpha-desc", label: "Endorser Z to A" },
]

const GIVEN_SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Recipient A to Z" },
  { key: "alpha-desc", label: "Recipient Z to A" },
]

const RESPONSE_FILTER_OPTIONS: SortOption<ResponseFilterKey>[] = [
  { key: "hide-rejected", label: "Shown on profile" },
  { key: "only-rejected", label: "Rejected only" },
  { key: "show-all", label: "All endorsements" },
]

/**
 * Endorsements tab on a profile, as rows like the Overview: Received and
 * Given sub-tabs (counts in the tabs), a search field and a sort menu once
 * a list is long, and one row per account.
 *
 * Read paths:
 *   - Received: indexer query for badge.award records with
 *     `subject == profileDid`, then a per-issuer PDS check that the
 *     referenced definition is endorsement-typed.
 *   - Given: direct PDS listRecords on the profile's own repo, filtered
 *     to awards whose `badge.uri` points at an endorsement definition.
 *
 * The account itself (personal, or a group while acting as it) can
 * accept / reject what it received, revoke what it gave, endorse people,
 * and select several rows for a bulk action. A personal account manages
 * the same things, plus its endorsement lists, in Records.
 */
export default function ProfileEndorsements({ did }: ProfileEndorsementsProps) {
  const { did: viewerDid } = useAuth()
  const viewerIsOwner = !!viewerDid && viewerDid === did

  // Acting AS this group: when an owner/admin operates a group and views
  // the group's own profile, the give, revoke-given and received
  // accept/reject actions write to the GROUP's repo via `manageTargetDid`.
  // While acting as a group you must NOT manage your PERSONAL
  // endorsements (that would write to your personal repo while the chrome
  // says you're the group), so personal management requires `!activeOrg`.
  const { activeOrg } = useOrg()
  const actingAsThisGroup = !!activeOrg && activeOrg.groupDid === did
  const canManage = (viewerIsOwner && !activeOrg) || actingAsThisGroup
  const manageTargetDid = actingAsThisGroup ? did : undefined
  const isPersonalOwner = viewerIsOwner && !activeOrg

  const given = useGivenEndorsements(did)
  // The account itself sees ALL received endorsements (including rejected
  // ones) so the response filter can offer them; other viewers get the
  // default (rejected filtered out at the hook).
  const received = useReceivedEndorsements(did, {
    includeRejected: canManage,
  })
  // Read the GROUP's responses when acting as it on its own profile.
  const ownStates = useOwnResponseStates(actingAsThisGroup ? did : undefined)

  // Sub-tab is URL-driven via `?sub=received|given` so a refresh keeps the
  // view and links can open it. "received" stays implicit.
  const [subParam, setSubParam] = useUrlParam("sub", { defaultValue: "received" })
  const tab: SubTab = subParam === "given" ? "given" : "received"
  const setTab = useCallback((next: SubTab) => setSubParam(next), [setSubParam])

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")
  // The account's response filter on Received. Rejected endorsements stay
  // in the data so flipping the filter needs no refetch.
  const [responseFilter, setResponseFilter] =
    useState<ResponseFilterKey>("hide-rejected")

  // Multi-select (the account itself), behind a visible "Select" button.
  // Keyed by representative award URI; cleared when the sub-tab changes so
  // a URI from the other tab can't reach a bulk action.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  useEffect(() => {
    clearSelection()
    setSelecting(false)
  }, [tab, clearSelection])

  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  // The optimistic overlay lives in `useReceivedEndorsements` itself, so
  // the list already reflects an Endorse / Revoke made from the header.
  const displayReceived = received.endorsements

  const rejectedCount = useMemo(
    () =>
      canManage
        ? displayReceived.filter((e) => ownStates.resolve(e.uri).state === "rejected")
            .length
        : 0,
    [displayReceived, canManage, ownStates],
  )

  const filteredReceived = useMemo(() => {
    if (!canManage) return displayReceived
    return displayReceived.filter((e) => {
      const { state } = ownStates.resolve(e.uri)
      if (responseFilter === "show-all") return true
      if (responseFilter === "only-rejected") return state === "rejected"
      return state !== "rejected"
    })
  }, [displayReceived, canManage, ownStates, responseFilter])

  // Endorse-people modal. When the viewer can manage this profile, `given`
  // IS their own endorsement set, so it seeds "already endorsed".
  const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false)
  const ownAlreadyEndorsedDids = useMemo(
    () => new Set(canManage ? given.endorsements.map((e) => e.subjectDid) : []),
    [canManage, given.endorsements],
  )
  const openEndorse = useCallback(() => setIsEndorseModalOpen(true), [])

  // Names to search and sort by: issuers on Received, recipients on Given.
  const dids = useMemo(() => {
    if (tab === "received") {
      return Array.from(new Set(displayReceived.map((e) => e.issuerDid)))
    }
    return Array.from(new Set(given.endorsements.map((e) => e.subjectDid)))
  }, [tab, displayReceived, given.endorsements])
  const names = useAuthorNamesMap(dids)

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

  const selectable = canManage && selecting

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

  // Bulk revoke on Given: every award for each selected recipient.
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

  // Bulk reject on Received: you can't delete someone else's award, so
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

  // Stable post-write callbacks so the memoized rows don't re-render on
  // every keystroke.
  const onReceivedAfterWrite = useCallback(async () => {
    ownStates.invalidate()
    await ownStates.refetch()
  }, [ownStates])
  const givenRefetch = given.refetch
  const onGivenAfterRevoke = useCallback(() => givenRefetch(), [givenRefetch])
  const clearSearch = useCallback(() => setQuery(""), [])

  const sourceLength =
    tab === "received" ? filteredReceived.length : given.endorsements.length
  const showSearch = sourceLength > PANEL_SEARCH_MIN || query.trim() !== ""
  // The response filter shows for the account itself once anything has
  // been rejected (or the filter is already off its default).
  const showFilter =
    canManage &&
    tab === "received" &&
    (rejectedCount > 0 || responseFilter !== "hide-rejected")
  const filterMenu = showFilter ? (
    <PanelMenu
      label="Filter endorsements"
      value={responseFilter}
      options={RESPONSE_FILTER_OPTIONS}
      onChange={setResponseFilter}
    />
  ) : null

  const receivedCount =
    received.isLoading && displayReceived.length === 0
      ? undefined
      : filteredReceived.length
  const givenCount =
    given.isLoading && given.endorsements.length === 0
      ? undefined
      : given.endorsements.length

  return (
    <Tabs
      value={tab}
      onChange={(v) => setTab(v as SubTab)}
      variant="segmented"
      className="profile-panel"
    >
      <SectionHeader
        title="Endorsements"
        description={
          isPersonalOwner
            ? "Give, hide and sort endorsements into lists in your Workspace."
            : undefined
        }
        action={
          isPersonalOwner ? (
            <SeeAllLink href="/records?kind=endorsements" label="Manage endorsements" />
          ) : canManage ? (
            <Button variant="secondary" size="sm" onClick={openEndorse}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Endorse someone
            </Button>
          ) : null
        }
      />

      <div className="profile-panel__head">
        <TabList aria-label="Endorsements sections">
          <Tab value="received" count={receivedCount}>
            Received
          </Tab>
          <Tab value="given" count={givenCount}>
            Given
          </Tab>
        </TabList>
        {canManage && sourceLength > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((v) => !v)
              clearSelection()
            }}
          >
            {selecting ? "Done" : "Select"}
          </Button>
        ) : null}
      </div>

      {showSearch ? (
        <PanelTools
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search endorsements"
          sort={sort}
          sortOptions={tab === "received" ? RECEIVED_SORT_OPTIONS : GIVEN_SORT_OPTIONS}
          onSortChange={setSort}
          sortLabel="Sort endorsements"
          extra={filterMenu}
        />
      ) : filterMenu ? (
        <div className="profile-panel__tools profile-panel__tools--menus">
          <div className="profile-panel__menus">{filterMenu}</div>
        </div>
      ) : null}

      <TabPanel value="received">
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
        <ReceivedList
          visible={visibleReceived}
          total={filteredReceived.length}
          isLoading={received.isLoading && displayReceived.length === 0}
          error={received.error}
          onRetry={received.refetch}
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
          query={query}
          onClearSearch={clearSearch}
        />
      </TabPanel>
      <TabPanel value="given">
        {selectable ? (
          <BulkBar
            selectedCount={selected.size}
            allSelected={allSelected}
            anyVisible={visibleUris.length > 0}
            onToggleAll={toggleAll}
            actionLabel="Revoke selected"
            actionIcon={Trash2}
            busy={bulkBusy}
            error={bulkError}
            onAction={() => setBulkConfirmOpen(true)}
          />
        ) : null}
        <GivenList
          visible={visibleGiven}
          total={given.endorsements.length}
          isLoading={given.isLoading && given.endorsements.length === 0}
          error={given.error}
          onRetry={given.refetch}
          viewerIsOwner={canManage}
          viewerDid={viewerDid}
          targetDid={manageTargetDid}
          selectable={selectable}
          selected={selected}
          onToggleOne={toggleOne}
          onAfterRevoke={onGivenAfterRevoke}
          onEndorse={canManage ? openEndorse : undefined}
          query={query}
          onClearSearch={clearSearch}
        />
      </TabPanel>

      {bulkConfirmOpen ? (
        <ConfirmDialog
          title={`Revoke ${selected.size} endorsement${selected.size === 1 ? "" : "s"}?`}
          message="The selected endorsements will be removed. You can endorse those accounts again later."
          confirmLabel={`Revoke endorsement${selected.size === 1 ? "" : "s"}`}
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
            // Refresh Given so the new endorsements show there; close
            // after the refresh so the spinner clears first.
            setIsEndorseModalOpen(false)
            await given.refetch()
          }}
        />
      ) : null}
    </Tabs>
  )
}
