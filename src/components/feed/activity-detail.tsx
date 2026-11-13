"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { profileUrl, recordUrl } from "@/lib/urls"
import { usePageTitle, useRegisterPageHeader } from "@/lib/navbar-context"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { authFetch } from "@/lib/auth/fetch"
import { toUserErrorMessage } from "@/lib/utils/api"
import { ChevronDown, Pencil, Plus, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import {
  resolveActivityImageUrl,
  evaluateWorkScope,
} from "@/lib/atproto/activity"
import { useScrollTopOnTabChange } from "@/hooks/use-scroll-top-on-tab-change"
import { useRights } from "@/hooks/use-rights"
import { formatShortDate } from "@/lib/utils/format-date"
import Banner from "@/components/ui/banner"
import EmptyState from "@/components/ui/empty-state"
import SectionHeader, { SeeAllLink } from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import { TabPanelTransition } from "@/components/ui/tab-panel-transition"
import { CERT_DETAIL_TABS } from "@/lib/detail-tabs"
import { useActivityFunding } from "@/hooks/use-activity-funding"
import { useContextUpdates } from "@/hooks/use-context-updates"
import { useMergedFunding } from "@/hooks/use-merged-funding"
import FundingReceiptRow, {
  FundingReceiptHeader,
} from "@/components/explore-page/funding-receipt-row"
import FundingConfirmedByPopover from "@/components/explore-page/funding-confirmed-by-popover"
import { matchesConfirmedBy } from "@/lib/atproto/funding-provenance"
import { useTrustedEvaluators } from "@/hooks/use-trusted-evaluators"
import FundingReceiptFormModal from "@/components/funding/funding-receipt-form-modal"
import FundingIdentityChoiceDialog from "@/components/funding/funding-identity-choice-dialog"
import RightsDetailModal from "@/components/feed/rights-detail-modal"
import Button from "@/components/ui/button"
import { useFundingConfirmedBy } from "@/hooks/use-funding-confirmed-by"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import CertLocationsMap from "./cert-locations-map"
import {
  ActivityProjectField,
  ContributorWeightHeader,
  ContributorRow,
  RecordByline,
  RecordHeader,
  RecordSectionTabs,
} from "./cert-detail-parts"
import { SectionTitleCount } from "@/components/create/form-action-bar"
import {
  contributorKey,
  contributionRoleText,
  buildWeightPercents,
} from "@/lib/atproto/contributor-display"
import ContextUpdates from "@/components/context/context-updates"
import type { ClaimActivity } from "@/lib/atproto/activity-types"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_CERTS_TYPE } from "@/lib/atproto/typed-lists"

// Tab-gated: pulls in d3-hierarchy + the treemap layout. Load it only
// when the Contributors tab is actually opened, not in the base
// activity-detail route bundle every viewer downloads.
const ActivityFancyBoard = dynamic(
  () =>
    import("@/components/contributor-board/activity-fancy-board").then(
      (m) => m.ActivityFancyBoard,
    ),
  { ssr: false },
)

/** Contributors previewed in the Overview's details column. */
const ASIDE_CONTRIB_PREVIEW = 5
/** Funding receipts previewed on the Overview. */
const OVERVIEW_FUNDING_PREVIEW = 5

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
  /** CID of the record at read time (the list / funding strongRefs). */
  cid: string
  /** Resolved handle of the author. */
  handle: string | null
}

// Single date format used throughout this view: "Mon D, YYYY".
const formatDate = formatShortDate

/**
 * Detail view of a single activity claim.
 *
 * Layout, the same at every width:
 *   - The record header: "Activity" eyebrow, the title (the page's h1)
 *     with the owner's Edit button and the ⋯ record menu beside it, and
 *     the byline (author, date created, project).
 *   - The section tabs (Overview / Contributors / Funding / Updates).
 *   - The tab content. On Overview, from 800px, a two-column body: the
 *     summary, updates, funding and locations on the left; the image and
 *     the details (time period, work scope, contributors, rights) on the
 *     right. Phones stack the two into one reading order (cert-detail.css).
 *
 * Editing happens on the edit page (`/{actor}/activity/{rkey}/edit`).
 */
export default function ActivityDetail({
  did,
  value,
  cid,
}: ActivityDetailProps) {
  const imageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null

  const [imageFailed, setImageFailed] = useState(false)
  // Live trusted-evaluator set (curated list) — gates the funding-receipt
  // "evaluator" provenance treatment.
  const { evaluatorDids: trustedEvaluatorDids } = useTrustedEvaluators()
  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  const workScopeLabel = evaluateWorkScope(value.workScope)

  // Time period rendering:
  //   - both set    → "Jan 1, 2026 – Mar 15, 2026"
  //   - only start  → "Jan 1, 2026 (ongoing)"
  //   - only end    → "Until Mar 15, 2026"
  //   - neither     → "Unspecified"
  const startDate = value.startDate ? formatDate(value.startDate) : null
  const endDate = value.endDate ? formatDate(value.endDate) : null
  let timePeriodLabel: string
  if (startDate && endDate) {
    timePeriodLabel = `${startDate} – ${endDate}`
  } else if (startDate) {
    timePeriodLabel = `${startDate} (ongoing)`
  } else if (endDate) {
    timePeriodLabel = `Until ${endDate}`
  } else {
    timePeriodLabel = "Unspecified"
  }

  const contributors = useMemo(
    () => value.contributors ?? [],
    [value.contributors],
  )
  const contributorCount = contributors.length
  // Percentages are a full pass over the contributor list; keyed on
  // `contributors` so unrelated re-renders reuse them.
  const weightPercents = useMemo(
    () => buildWeightPercents(contributors),
    [contributors],
  )
  const locations = value.locations ?? []
  const showFullDescription = isRenderableDescription(value.description)
  // Overview "Read full description": reveals the full description inline as
  // its own Description section (the user stays on Overview).
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  // ClaimActivity doesn't carry its own rkey; the route at
  // /[actor]/[type]/[rkey] does. Derived from the trailing pathname
  // segment during render (not in a mount effect) so rkey is available on
  // the first commit and the funding / updates / projects fetches start
  // immediately.
  const pathname = usePathname()
  const rkey = useMemo(() => {
    const segments = (pathname ?? "").split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) return null
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }, [pathname])
  const recordUri = rkey
    ? `at://${did}/org.hypercerts.claim.activity/${rkey}`
    : null

  const { name: rightsName, isLoading: rightsLoading } = useRights(
    value.rights?.uri ?? null,
  )

  // Funding receipts whose `for` strongRef points at this activity.
  // Loaded once (first: 100) and shared by the overview preview (up to
  // 5 + "See all") and the Funding tab (all of them).
  const {
    receipts: fetchedFunding,
    isLoading: fundingLoading,
    refetch: refetchFunding,
  } = useActivityFunding(did, rkey)
  // Updates count — shown on the Updates tab.
  const { updates } = useContextUpdates(recordUri)
  const updatesCount = updates.length
  // Overlay the viewer's optimistic confirmations + collapse matchingReceipt
  // pairs so a just-confirmed payment shows as one confirmed row immediately
  // (issue #186). A *recorded* (non-confirmation) receipt is not optimistically
  // inserted — its provenance must come only from the indexer.
  const fundingReceipts = useMergedFunding(fetchedFunding, recordUri)

  // Record-funding modal (opener gating is derived after `useAuth` below).
  const [recordFundingOpen, setRecordFundingOpen] = useState(false)
  // After recording funding we poll the indexer until the new receipt lands
  // (it's eventually consistent) — it then renders through the normal list. We
  // deliberately don't optimistically insert it: a freshly-recorded receipt
  // carries no attestations yet, so the "Confirmed by" filter would hide it —
  // provenance must come from the indexer. `pendingFundingUri` is the receipt
  // we're waiting on; the timeout flag falls back to a manual refresh if the
  // indexer is unusually slow.
  const [pendingFundingUri, setPendingFundingUri] = useState<string | null>(null)
  const [fundingRecordPollTimedOut, setFundingRecordPollTimedOut] =
    useState(false)

  // Stop polling once the indexer returns the just-recorded receipt.
  useEffect(() => {
    if (!pendingFundingUri) return
    if (fetchedFunding.some((r) => r.uri === pendingFundingUri)) {
      setPendingFundingUri(null)
      setFundingRecordPollTimedOut(false)
    }
  }, [pendingFundingUri, fetchedFunding])

  // Poll the indexer after recording until the receipt lands, then give up to
  // a manual refresh. Kept separate from the arrival check so the interval
  // isn't torn down and restarted on every fetch result.
  useEffect(() => {
    if (!pendingFundingUri) return
    let attempts = 0
    const id = setInterval(() => {
      attempts += 1
      refetchFunding()
      if (attempts >= 10) {
        clearInterval(id)
        setPendingFundingUri(null)
        setFundingRecordPollTimedOut(true)
      }
    }, 1500)
    return () => clearInterval(id)
  }, [pendingFundingUri, refetchFunding])
  // When the viewer is an owner/admin of the authoring group, clicking Record
  // first asks whether to record as themselves or as the group.
  const [recordIdentityOpen, setRecordIdentityOpen] = useState(false)
  const [recordFundingAs, setRecordFundingAs] =
    useState<"individual" | "group">("individual")
  // Rights detail modal (opened from the Rights row).
  const [rightsModalOpen, setRightsModalOpen] = useState(false)

  // Funding "Confirmed by" filter — same URL-backed state + popover as
  // /explore. Applied client-side to the loaded receipts (shared by the
  // overview preview and the Funding tab). `confirmedByOpen` drives the
  // popover; one instance is mounted at a time (the sections are tab-gated).
  const confirmedBy = useFundingConfirmedBy()
  const [confirmedByOpen, setConfirmedByOpen] = useState(false)
  const filteredFunding = useMemo(
    () =>
      fundingReceipts.filter((r) =>
        matchesConfirmedBy(
          r.attestations,
          confirmedBy.roles,
          confirmedBy.thirdParties,
        ),
      ),
    [fundingReceipts, confirmedBy.roles, confirmedBy.thirdParties],
  )
  // The number of loaded receipts the filter currently shows, so the count
  // always agrees with the list below it. (Counts the loaded window; an
  // activity with >100 receipts is the known page-1 cap pending
  // magic-indexer #214.)
  const shownFundingCount = filteredFunding.length

  // The Confirmed-by filter control is rendered identically in the overview
  // section and the Funding tab (only one is mounted at a time, tab-gated),
  // so build it once.
  const confirmedByControl = (
    <FundingConfirmedByPopover
      receipts={fundingReceipts}
      roles={confirmedBy.roles}
      onToggleRole={confirmedBy.toggleRole}
      thirdParties={confirmedBy.thirdParties}
      onToggleThirdParty={confirmedBy.toggleThirdParty}
      isDefault={confirmedBy.isDefault}
      onReset={confirmedBy.reset}
      open={confirmedByOpen}
      onOpenChange={setConfirmedByOpen}
      triggerVariant="section"
    />
  )

  // Note explaining the default Confirmed-by filter: out of the box the
  // funding section lists only receipts the recipient has confirmed. Shown
  // only while the filter is at its default (and there's something to
  // explain).
  const recipientConfirmedNote =
    confirmedBy.isDefault && fundingReceipts.length > 0 ? (
      <Banner variant="info" className="py-2.5">
        Showing only receipts the recipient has confirmed. Change the filter to
        see more.
      </Banner>
    ) : null

  // The section tabs drive which slice of the record renders.
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  const activeTab:
    | "overview"
    | "contributors"
    | "funding"
    | "updates" =
    tabParam === "contributors" ||
    tabParam === "funding" ||
    tabParam === "updates"
      ? tabParam
      : "overview"

  // On mobile, reset to the top when switching sub-tabs so the tab's
  // first rows aren't left hidden behind the fixed navbar.
  useScrollTopOnTabChange(activeTab)

  // The record title is the page's h1 on every tab (the record header), so
  // the page registers its header and the chrome renders no h1 of its own.
  // The navbar title (the document title) stays the activity's name on
  // every tab: the tab strip names the section.
  useRegisterPageHeader()
  usePageTitle(value.title || "Activity")

  // Edit affordance — the viewer can act on the activity when they're
  // signed in as its creator. Two paths:
  //   - Personal session DID === activity DID (own record), OR
  //   - Acting as the group that owns it, with the owner or admin role.
  //     Members can switch into a group but the BFF rejects their writes,
  //     so the affordance stays hidden for them.
  const { did: sessionDid, isAuthenticated } = useAuth()
  // Funding: any signed-in viewer can record a payment they were party to;
  // trusted evaluators additionally get the third-party direction (gated
  // inside the modal).
  const canRecordFunding = isAuthenticated && !!sessionDid
  // We recorded a receipt and it hasn't surfaced from the indexer yet — used
  // to suppress the "no receipts yet" empty state while we wait.
  const fundingRecordInFlight =
    pendingFundingUri !== null || fundingRecordPollTimedOut
  const fundingRecordedNote = pendingFundingUri ? (
    <p
      role="status"
      className="cert-detail__short-desc funding-form__recorded-note"
    >
      Recording your funding — it will appear here shortly…
      <RefreshCw
        size={14}
        strokeWidth={2}
        aria-hidden
        className="animate-spin ml-1.5 inline-block align-middle"
      />
    </p>
  ) : fundingRecordPollTimedOut ? (
    <p
      role="status"
      className="cert-detail__short-desc funding-form__recorded-note"
    >
      Funding recorded. It is taking longer than usual to appear.
      <Button
        size="icon"
        variant="ghost"
        aria-label="Refresh the funding list"
        loading={fundingLoading}
        className="ml-1.5 align-middle"
        onClick={() => refetchFunding()}
      >
        <RefreshCw size={14} strokeWidth={2} aria-hidden />
      </Button>
    </p>
  ) : null
  const { activeOrg, groups, switchOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  // The group that authored this activity, when the viewer is an owner/admin
  // of it (so they can author records as the group) — regardless of which
  // identity is currently active. Drives the "record as me / as the group"
  // choice on the funding form.
  const fundingAuthoringGroup =
    groups.find(
      (g) =>
        g.groupDid === did &&
        (g.role === "owner" || g.role === "admin"),
    ) ?? null
  // Opening the record form: ask the identity question first when the viewer
  // could record as the group, else go straight in as the individual.
  const openRecordFunding = () => {
    setPendingFundingUri(null)
    setFundingRecordPollTimedOut(false)
    if (fundingAuthoringGroup) {
      setRecordIdentityOpen(true)
    } else {
      setRecordFundingAs("individual")
      setRecordFundingOpen(true)
    }
  }
  // "Record funding" opener — shown in both the overview preview and the
  // Funding tab headers (only one is mounted at a time, tab-gated).
  const recordFundingControl = canRecordFunding ? (
    <Button variant="secondary" size="sm" onClick={openRecordFunding}>
      <Plus size={14} strokeWidth={1.75} aria-hidden />
      Record funding
    </Button>
  ) : null
  // When acting as a group, the user can only edit records OWNED BY that
  // group — even though the session DID is still their personal identity.
  // The personal-edit branch only fires when there's no active org.
  const isCreator = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  // Group-edit affordance — the viewer is NOT a direct editor (own record
  // or active-org owner/admin), but they ARE an owner/admin of the group
  // that owns this activity while signed in under a different identity
  // (personal, or another group). Their Edit button, on confirm, switches
  // them into the owning group before opening the editor — the edit page's
  // own gate then passes and writes route through the group.
  const editAsGroup = isCreator
    ? null
    : groups.find(
        (g) =>
          g.groupDid === did &&
          (g.role === "owner" || g.role === "admin"),
      ) ?? null
  const editAsGroupLabel = editAsGroup
    ? editAsGroup.displayName || editAsGroup.handle
    : null
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const editHref = `${recordUrl(did, "activity", rkey ?? "")}/edit`
  // Build a tab href that PRESERVES the current query params (e.g. the
  // funding "Confirmed by" filter `?confirmedRoles=`), so jumping from the
  // overview to a sub-tab via "See all" doesn't reset the filter. Mirrors the
  // tab strip's `hrefFor`.
  const tabHref = (tab: string): string | null => {
    if (!pathname) return null
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (tab === "overview") params.delete("tab")
    else params.set("tab", tab)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const fundingHref = tabHref("funding")
  const contributorsHref = tabHref("contributors")

  // ----- Destructive delete -----
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDeleteConfirm = useCallback(async () => {
    if (!rkey) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      // Group BFF when acting as the owning group, the xrpc proxy on the
      // user's own repo otherwise. The group BFF takes DELETE; the xrpc
      // proxy expects POST for com.atproto.repo.deleteRecord.
      const useGroupRoute = canEditAsActiveOrg
      const res = await authFetch(
        useGroupRoute
          ? `/api/groups/${encodeURIComponent(did)}/activity`
          : "/api/xrpc/com/atproto/repo/deleteRecord",
        {
          method: useGroupRoute ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useGroupRoute
              ? { rkey }
              : {
                  repo: did,
                  collection: "org.hypercerts.claim.activity",
                  rkey,
                },
          ),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          toUserErrorMessage(
            res.status,
            (data as { error?: string }).error,
            "Couldn't delete this activity. Try again",
          ),
        )
      }
      // Hard navigation (window.location) rather than router.push so every
      // client-side cache the destination page might keep (profile lists,
      // the indexer feed cache, module-level memoised fetches) is cleared
      // on the way — otherwise the just-deleted activity can linger.
      if (typeof window !== "undefined") {
        window.location.href = profileUrl(did)
      } else {
        router.push(profileUrl(did))
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Couldn't delete this activity. Try again.",
      )
      setIsDeleting(false)
    }
  }, [rkey, did, canEditAsActiveOrg, router])

  // The record's actions, beside the title at every width: the owner's
  // Edit (a visible button), then the ⋯ menu with Delete, Share, Add to
  // list and Copy AT URI.
  const recordActions = (
    <>
      {isCreator ? (
        <Button
          href={editHref}
          variant="secondary"
          size="sm"
          aria-label="Edit activity"
        >
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          Edit
        </Button>
      ) : editAsGroup ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label="Edit activity"
          tooltip={`Edit as ${editAsGroupLabel}`}
          onClick={() => setGroupEditOpen(true)}
        >
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          Edit
        </Button>
      ) : null}
      {recordUri ? (
        <AddToListMenu
          targetUri={recordUri}
          targetCid={cid}
          targetType={LIST_CERTS_TYPE}
          shareTab={activeTab === "overview" ? null : activeTab}
          editActions={
            isCreator
              ? {
                  isCreator,
                  editHref,
                  editAsGroupLabel: null,
                  onEditAsGroup: () => setGroupEditOpen(true),
                  onDelete: () => {
                    setDeleteError(null)
                    setDeleteOpen(true)
                  },
                }
              : null
          }
        />
      ) : null}
    </>
  )

  // Overview-only summary. Rendered as a sibling of the tab panel (not
  // inside it) so the phone reading order can place the details rows
  // (time period, work scope, contributors, rights) between it and the
  // rest of the overview.
  const shortDescSection =
    activeTab === "overview" && value.shortDescription ? (
      <section className="cert-detail__section cert-detail__section--summary">
        <SectionHeader title="Summary" />
        <p className="cert-detail__short-desc" dir="auto">
          {value.shortDescription}
        </p>
      </section>
    ) : null

  // Overview "Read full description": a centered disclosure button below the
  // summary that reveals the full rich description inline as its own
  // Description section, and collapses it again. The chevron points down to
  // expand and flips up once open (driven off aria-expanded in CSS).
  const descriptionToggle = (
    <div className="cert-detail__desc-toggle">
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={descriptionExpanded}
        onClick={() => setDescriptionExpanded((open) => !open)}
        className="cert-detail__desc-toggle-btn"
      >
        {descriptionExpanded ? "Hide description" : "Read full description"}
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="cert-detail__desc-toggle-chevron"
        />
      </Button>
    </div>
  )

  const descriptionReveal = !showFullDescription ? null : descriptionExpanded ? (
    <>
      <section className="cert-detail__section">
        <SectionHeader title="Description" />
        <LeafletDocument value={value.description} did={did} />
      </section>
      {descriptionToggle}
    </>
  ) : (
    descriptionToggle
  )

  // Funding list body, shared by the overview preview (first five) and the
  // Funding tab (all).
  const fundingBody = (limit?: number) =>
    fundingReceipts.length === 0 ? (
      fundingRecordInFlight ? null : (
        <EmptyState
          variant="inline"
          title="No funding receipts for this activity yet."
        />
      )
    ) : filteredFunding.length > 0 ? (
      <ul className="cert-detail__funding-list">
        <li>
          <FundingReceiptHeader showFor={false} />
        </li>
        {(limit ? filteredFunding.slice(0, limit) : filteredFunding).map((r) => (
          <li key={r.uri}>
            <FundingReceiptRow receipt={r} showTextParties showFor={false} />
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState variant="inline" title="No funding receipts match this filter.">
        {!confirmedBy.isDefault ? (
          <Button variant="ghost" size="sm" onClick={confirmedBy.reset}>
            Reset filter
          </Button>
        ) : null}
      </EmptyState>
    )

  // The Contributors list — shown on the Contributors tab beneath the
  // contributor board.
  const contributorsSection = (
    <section className="cert-detail__section">
      <SectionHeader
        title={<SectionTitleCount label="Contributors" count={contributorCount} />}
      />
      {contributorCount > 0 ? (
        <div>
          {contributors.some((c) => c.contributionWeight != null) ? (
            <ContributorWeightHeader />
          ) : null}
          <ul className="cert-detail__contributors">
            {contributors.map((c, i) => (
              <ContributorRow
                key={contributorKey(c, i)}
                contributor={c}
                role={contributionRoleText(c.contributionDetails)}
                weight={weightPercents.get(i) ?? c.contributionWeight ?? null}
              />
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState variant="inline" title="No contributors listed." />
      )}
    </section>
  )

  return (
    <>
      <article className="record-page">
        <RecordHeader
          kind="Activity"
          title={value.title?.trim() || "Untitled activity"}
          actions={recordActions}
        >
          <RecordByline did={did} createdAt={value.createdAt || null}>
            <ActivityProjectField
              did={did}
              rkey={rkey}
              canAddToProject={isCreator}
            />
          </RecordByline>
        </RecordHeader>

        <RecordSectionTabs
          tabs={CERT_DETAIL_TABS}
          activeKey={activeTab}
          ariaLabel="Activity sections"
          counts={{
            contributors: contributorCount,
            funding: shownFundingCount,
            updates: updatesCount,
          }}
        />

        <div
          className={`page-layout cert-detail--wide cert-detail--tab-${activeTab}`}
        >
          <aside className="cert-detail__aside" aria-label="Activity details">
            {/* The image box renders only when there's a real image. */}
            {imageUrl && !imageFailed ? (
              <div className="cert-detail__image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="cert-detail__image-img"
                  onError={() => setImageFailed(true)}
                />
              </div>
            ) : null}

            <dl className="cert-detail__meta">
              <div className="cert-detail__meta-row cert-detail__meta-row--timeperiod">
                <dt className="cert-detail__meta-label">Time period</dt>
                <dd className="cert-detail__meta-value">{timePeriodLabel}</dd>
              </div>

              {workScopeLabel ? (
                <div className="cert-detail__meta-row cert-detail__meta-row--workscope">
                  <dt className="cert-detail__meta-label">Work scope</dt>
                  <dd className="cert-detail__meta-value">{workScopeLabel}</dd>
                </div>
              ) : null}

              {/* Up to five contributors, with "See all" into the
                  Contributors tab. Percentages come from the FULL list
                  so the column adds to 100 even when only five show. */}
              {contributorCount > 0 ? (
                <div className="cert-detail__meta-row cert-detail__meta-row--contributors">
                  <dt className="cert-detail__meta-label cert-detail__meta-label--with-action">
                    <span className="cert-detail__meta-label-text">
                      Contributors{" "}
                      <span className="cert-detail__meta-count">
                        {contributorCount}
                      </span>
                    </span>
                    {contributorsHref ? <SeeAllLink href={contributorsHref} /> : null}
                  </dt>
                  <dd className="cert-detail__meta-value">
                    {contributors
                      .slice(0, ASIDE_CONTRIB_PREVIEW)
                      .some((c) => c.contributionWeight != null) ? (
                      <ContributorWeightHeader />
                    ) : null}
                    <ul className="cert-detail__contributors cert-detail__contributors--aside">
                      {contributors.slice(0, ASIDE_CONTRIB_PREVIEW).map((c, i) => (
                        <ContributorRow
                          key={contributorKey(c, i)}
                          contributor={c}
                          role={contributionRoleText(c.contributionDetails)}
                          weight={
                            weightPercents.get(i) ?? c.contributionWeight ?? null
                          }
                        />
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}

              {/* Rights references an external record; opens the rights
                  detail dialog. */}
              {value.rights ? (
                <div className="cert-detail__meta-row cert-detail__meta-row--rights">
                  <dt className="cert-detail__meta-label">Rights</dt>
                  <dd className="cert-detail__meta-value">
                    {rightsLoading && !rightsName ? (
                      <Skeleton variant="line" width="8rem" height="0.875rem" />
                    ) : (
                      <button
                        type="button"
                        className="cert-detail__rights-link"
                        onClick={() => setRightsModalOpen(true)}
                        title="View rights details"
                      >
                        {rightsName ? (
                          rightsName
                        ) : (
                          <span className="cert-detail__uri">{value.rights.uri}</span>
                        )}
                      </button>
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          </aside>

          <div className="page-layout__main cert-detail__main">
            {shortDescSection}

            <TabPanelTransition
              className="cert-detail__content"
              activeKey={activeTab}
              order={CERT_DETAIL_TABS.map((t) => t.key)}
            >
              {activeTab === "overview" ? (
                <>
                  {descriptionReveal}
                  {/* The latest update, then funding, then where. */}
                  {recordUri ? (
                    <ContextUpdates
                      subjectUri={recordUri}
                      variant="overview"
                      maxItems={1}
                      seeAllHref={tabHref("updates")}
                    />
                  ) : null}

                  {/* Funding preview — up to five receipts, with "See all"
                      into the Funding tab when there are more. Also shown
                      (header only) to a signed-in viewer with no receipts
                      yet, so they can record one. */}
                  {fundingReceipts.length > 0 || canRecordFunding ? (
                    <section className="cert-detail__section">
                      <SectionHeader
                        title={
                          <SectionTitleCount label="Funding" count={shownFundingCount} />
                        }
                        action={
                          <div className="cert-detail__section-actions">
                            {recordFundingControl}
                            {fundingReceipts.length > 0 ? confirmedByControl : null}
                            {fundingHref &&
                            filteredFunding.length > OVERVIEW_FUNDING_PREVIEW ? (
                              <SeeAllLink href={fundingHref} />
                            ) : null}
                          </div>
                        }
                      />
                      {fundingRecordedNote}
                      {recipientConfirmedNote}
                      {fundingBody(OVERVIEW_FUNDING_PREVIEW)}
                    </section>
                  ) : null}

                  {locations.length > 0 ? (
                    <section className="cert-detail__section cert-detail__section--locations">
                      <SectionHeader
                        title={
                          <SectionTitleCount label="Locations" count={locations.length} />
                        }
                      />
                      <CertLocationsMap locations={locations} />
                    </section>
                  ) : null}
                </>
              ) : activeTab === "contributors" ? (
                <>
                  {contributorCount > 0 ? (
                    <ActivityFancyBoard
                      did={did}
                      rkey={rkey}
                      contributors={contributors}
                    />
                  ) : null}
                  {contributorsSection}
                </>
              ) : activeTab === "funding" ? (
                <section className="cert-detail__section">
                  <SectionHeader
                    title={
                      <SectionTitleCount label="Funding" count={shownFundingCount} />
                    }
                    action={
                      recordFundingControl || fundingReceipts.length > 0 ? (
                        <div className="cert-detail__section-actions">
                          {recordFundingControl}
                          {fundingReceipts.length > 0 ? confirmedByControl : null}
                        </div>
                      ) : null
                    }
                  />
                  {fundingRecordedNote}
                  {recipientConfirmedNote}
                  {fundingLoading && fundingReceipts.length === 0 ? (
                    <div
                      className="flex flex-col gap-3"
                      role="status"
                      aria-label="Loading funding"
                    >
                      <Skeleton variant="line" width="100%" height="2.5rem" />
                      <Skeleton variant="line" width="100%" height="2.5rem" />
                      <Skeleton variant="line" width="100%" height="2.5rem" />
                    </div>
                  ) : (
                    fundingBody()
                  )}
                </section>
              ) : activeTab === "updates" && recordUri ? (
                <ContextUpdates
                  subjectUri={recordUri}
                  variant="full"
                  canEdit={isCreator || !!editAsGroup}
                  viewerDid={sessionDid}
                />
              ) : null}
            </TabPanelTransition>
          </div>
        </div>
      </article>
      {deleteOpen ? (
        <DeleteRecordDialog
          title="Delete activity?"
          recordName={value.title || ""}
          recordTypeLabel="activity"
          isDeleting={isDeleting}
          errorMessage={deleteError}
          onCancel={() => {
            if (!isDeleting) setDeleteOpen(false)
          }}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
      {groupEditOpen && editAsGroup ? (
        <ConfirmDialog
          title="Edit as group"
          message={`This activity is published by ${editAsGroupLabel}. You'll switch to acting as that group to edit it — your changes are saved as the group, not your personal account.`}
          confirmLabel="Continue as group"
          confirmVariant="primary"
          onCancel={() => setGroupEditOpen(false)}
          onConfirm={() => {
            switchOrg(editAsGroup)
            setGroupEditOpen(false)
            router.push(editHref)
          }}
        />
      ) : null}
      {recordIdentityOpen && sessionDid && fundingAuthoringGroup ? (
        <FundingIdentityChoiceDialog
          individualDid={sessionDid}
          groupDid={did}
          onChoose={(as) => {
            setRecordFundingAs(as)
            setRecordIdentityOpen(false)
            setRecordFundingOpen(true)
          }}
          onClose={() => setRecordIdentityOpen(false)}
        />
      ) : null}
      {recordFundingOpen && sessionDid && recordUri
        ? (() => {
            // The author is the chosen identity: the group (only when the
            // viewer is its owner/admin) authors the receipt — letting it be
            // recorded as the recipient — otherwise the viewer personally.
            const asGroup = recordFundingAs === "group" && !!fundingAuthoringGroup
            const writerDid = asGroup ? did : sessionDid
            return (
              <FundingReceiptFormModal
                writerDid={writerDid}
                writerIsGroup={asGroup}
                canRecordAsRecipient={asGroup || sessionDid === did}
                isEvaluator={trustedEvaluatorDids.includes(writerDid)}
                activityAuthorDid={did}
                forActivity={{
                  uri: recordUri,
                  cid,
                  title: value.title || undefined,
                }}
                onClose={() => setRecordFundingOpen(false)}
                onCreated={(result) => {
                  setFundingRecordPollTimedOut(false)
                  setPendingFundingUri(result.uri)
                }}
              />
            )
          })()
        : null}
      {rightsModalOpen && value.rights ? (
        <RightsDetailModal
          uri={value.rights.uri}
          cid={value.rights.cid}
          onClose={() => setRightsModalOpen(false)}
        />
      ) : null}
    </>
  )
}
