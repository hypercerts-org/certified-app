"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { profileUrl, recordUrl } from "@/lib/urls"
import { usePageTitle, usePageDesktopTitle, usePageRecordMenu } from "@/lib/navbar-context"
import Link from "next/link"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { authFetch } from "@/lib/auth/fetch"
import {
  Calendar,
  ChevronDown,
  FileText,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  Users,
} from "lucide-react"
import CertIcon from "@/components/ui/cert-icon"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import {
  resolveActivityImageUrl,
  evaluateWorkScope,
} from "@/lib/atproto/activity"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformationRecord } from "@/hooks/use-contributor-information-record"
import { useScrollTopOnTabChange } from "@/hooks/use-scroll-top-on-tab-change"
import { useRights } from "@/hooks/use-rights"
import { getInitials } from "@/lib/utils/initials"
import { formatShortDate } from "@/lib/utils/format-date"
import Avatar from "@/components/ui/avatar"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EditBanner from "@/components/ui/edit-banner"
import Banner from "@/components/ui/banner"
import { TabPanelTransition } from "@/components/ui/tab-panel-transition"
import { CERT_DETAIL_TABS } from "@/lib/detail-tabs"
import { useCertProjects } from "@/hooks/use-cert-projects"
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import { useFundingConfirmedBy } from "@/hooks/use-funding-confirmed-by"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { TransitionLink } from "@/lib/view-transitions"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
import CertLocationsMap from "./cert-locations-map"
import ContextUpdates from "@/components/context/context-updates"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { putCertRecord } from "@/lib/atproto/cert"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { saveWithSwap } from "@/lib/atproto/save-with-swap"
import { saveDraft, clearDraft } from "@/lib/utils/swap-drafts"
import { asLinearDocument } from "@/lib/leaflet/guards"
import { isEmptyLongDescription } from "@/lib/leaflet/guards"
import type { LinearDocument } from "@/lib/leaflet/types"
import type {
  ActivityContributor as ActivityContributorType,
  ClaimActivity,
} from "@/lib/atproto/activity-types"
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"
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

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
  /** CID of the record at read time. Threaded into `putRecord` as
   *  `swapRecord` so a concurrent edit in another tab can't silently
   *  clobber this save (issue #71). */
  cid: string
  /** Resolved handle, for the navbar breadcrumb (overview tab). */
  handle: string | null
}

/**
 * Stable React key for a contributor row. Contributors carry no id of
 * their own, so we use the strong-ref URI / inline identity plus the
 * position to disambiguate duplicates — avoids the `key={i}` antipattern.
 */
function contributorKey(c: ActivityContributorType, index: number): string {
  const id = c.contributorIdentity as unknown
  if (id && typeof id === "object") {
    const obj = id as Record<string, unknown>
    if (typeof obj.uri === "string") return `${obj.uri}#${index}`
    if (typeof obj.identity === "string") return `${obj.identity}#${index}`
  }
  if (typeof id === "string") return `${id}#${index}`
  return `contributor-${index}`
}

/**
 * Extract role text defensively. The lexicon types this as an object
 * but some records store it as a bare string. `"role" in details`
 * throws when `details` is a primitive, so we type-check at runtime.
 */
function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

// Single date format used throughout this view: "Mon D, YYYY".
// Identical output to lib/utils/format-date.ts#formatShortDate, which
// also handles invalid input by returning the raw string.
const formatDate = formatShortDate

/**
 * Normalise contributor weights to a percent out of 100. The
 * lexicon stores `contributionWeight` as a free-form string so a
 * record can hold values like "1", "0.25", or "high". This helper
 * sums every parseable numeric weight and rewrites each as
 * `round(weight / total * 100)`, returning a map from contributor
 * index to display string. Non-numeric weights are left out of the
 * map; the caller falls back to the raw value so they still
 * render. When no weights parse (or the sum is zero) the returned
 * map is empty — every row falls back to its raw weight.
 */
function buildWeightPercents(
  contribs: readonly ActivityContributorType[],
): Map<number, string> {
  const out = new Map<number, string>()
  const parsed: Array<{ idx: number; n: number }> = []
  let total = 0
  contribs.forEach((c, idx) => {
    const raw = c.contributionWeight?.trim() ?? ""
    if (!raw) return
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n < 0) return
    parsed.push({ idx, n })
    total += n
  })
  if (total <= 0) return out
  for (const { idx, n } of parsed) {
    out.set(idx, `${Math.round((n / total) * 100)}`)
  }
  return out
}

/**
 * Detail view of a single activity claim.
 *
 * Layout:
 *   - Left aside: square cert image, optional "Project" section, then
 *     a small Created / Time period / Work scope / Rights meta list.
 *   - Main pane: title, then a date+author byline, then the full
 *     `shortDescription`, an optional disclosure to reveal the rich
 *     `description`, contributors, and a single map for all locations.
 *
 * The `.cert-detail--wide` modifier on the root opts this page's
 * `.app-shell__content` parent into a wider max-width via a `:has()`
 * rule in `cert-detail.css` — scoped, so every other page keeps the
 * 600px reading cap.
 */
export default function ActivityDetail({
  did,
  value,
  cid,
  handle,
}: ActivityDetailProps) {
  const baseImageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null

  const [imageFailed, setImageFailed] = useState(false)
  // Live trusted-evaluator set (curated list) — gates the funding-receipt
  // "evaluator" provenance treatment.
  const { evaluatorDids: trustedEvaluatorDids } = useTrustedEvaluators()
  useEffect(() => {
    setImageFailed(false)
  }, [baseImageUrl])

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

  const createdAbsolute = formatDate(value.createdAt)

  const contributors = useMemo(
    () => value.contributors ?? [],
    [value.contributors],
  )
  const contributorCount = contributors.length
  // Percentages are a full pass over the contributor list; keying the
  // memo on `contributors` keeps it stable across edit-form keystrokes
  // (which re-render this component but never touch the contributor set).
  const weightPercents = useMemo(
    () => buildWeightPercents(contributors),
    [contributors],
  )
  const locations = value.locations ?? []
  const showFullDescription = isRenderableDescription(value.description)
  // Overview "Read full description": reveals the full description inline as
  // its own Description section (the user stays on Overview). The Description
  // tab remains reachable from the top-bar tab strip for deep links.
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  // ClaimActivity doesn't carry its own rkey. The page route at
  // /activity/[did]/[rkey] does, and we want to pass it to the
  // Projects section. Rather than threading another prop from the
  // page (the page file is carved out beyond the breadcrumb wiring),
  // we read the last pathname segment client-side — same value the
  // page already decoded via `useParams`.
  const rkey = useRouteRkey()

  const { name: rightsName, isLoading: rightsLoading } = useRights(
    value.rights?.uri ?? null,
  )

  // Funding receipts whose `for` strongRef points at this activity.
  // Loaded once (first: 100) and shared by the overview preview (up to
  // 5 + "See all") and the Funding tab (all of them). Read-only — no
  // bearing on the inline-edit state machine.
  const {
    receipts: fetchedFunding,
    isLoading: fundingLoading,
    refetch: refetchFunding,
  } = useActivityFunding(did, rkey)
  // Updates count — drives the "Updates (N)" mobile navbar title, mirroring
  // the funding-count pattern.
  const { updates } = useContextUpdates(
    rkey ? `at://${did}/org.hypercerts.claim.activity/${rkey}` : null,
  )
  const updatesCount = updates.length
  // Overlay the viewer's optimistic confirmations + collapse matchingReceipt
  // pairs so a just-confirmed payment shows as one confirmed row immediately
  // (issue #186). A *recorded* (non-confirmation) receipt is not optimistically
  // inserted — its provenance must come only from the indexer.
  const fundingForUri =
    did && rkey ? `at://${did}/org.hypercerts.claim.activity/${rkey}` : null
  const fundingReceipts = useMergedFunding(fetchedFunding, fundingForUri)

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
  // Rights detail modal (opened from the Rights meta row).
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
  // Count shown next to the filter control: the number of loaded receipts the
  // filter currently shows, so it always agrees with the list below it. The
  // Confirmed-by filter is always applied (its default already hides
  // third-party-only receipts), so this is the filtered count in every state.
  // (Counts the loaded window; an activity with >100 receipts is the known
  // page-1 cap pending magic-indexer #214. The Funding tab strip label keeps
  // the unfiltered total receipt count.)
  const shownFundingCount = filteredFunding.length

  // The Confirmed-by filter control is rendered identically in the overview
  // section and the Funding tab (only one is mounted at a time, tab-gated),
  // so build it once. All props come from the shared confirmedBy state.
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

  // Section-scoped note explaining the default Confirmed-by filter: out of the
  // box the funding section lists only receipts the recipient has confirmed.
  // Shown only while the filter is at its default (and there's something to
  // explain) — it drops away the moment the user widens the filter, since
  // `confirmedBy.isDefault` flips to false. Built once and rendered in both the
  // overview preview and the Funding tab.
  const recipientConfirmedNote =
    confirmedBy.isDefault && fundingReceipts.length > 0 ? (
      <Banner variant="info" className="mb-3 py-2.5">
        Showing only receipts the recipient has confirmed. Change the filter to
        see more.
      </Banner>
    ) : null

  // Tab strip on the top bar (back-row) drives which slice of the
  // record renders in the right pane. Keep the left aside identical
  // across all tabs.
  const pathname = usePathname()
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

  // Navbar title: sub-tabs show the tab name next to the back arrow; the
  // overview shows the activity's own name. (We deliberately don't prefix
  // it with the author handle — the mobile bar is too narrow to show both,
  // and the name is the useful identifier.)
  usePageTitle(
    activeTab === "contributors"
      ? contributorCount > 0
        ? `Contributors (${contributorCount})`
        : "Contributors"
      : activeTab === "funding"
          ? shownFundingCount > 0
            ? `Funding (${shownFundingCount})`
            : "Funding"
          : activeTab === "updates"
            ? updatesCount > 0
              ? `Updates (${updatesCount})`
              : "Updates"
            : value.title || "Activity",
  )
  // Desktop top bar keeps the activity's name on every tab (the tab strip is
  // already visible there); only the mobile navbar title is tab-aware.
  usePageDesktopTitle(value.title || "Activity")

  // Edit affordance — the viewer can act on the cert when they're
  // signed in as the cert's creator. Two paths:
  //   - Personal session DID === cert.did (own cert), OR
  //   - Acting-as-group on the group's own cert, AND the role is
  //     owner or admin. Members of a group can switch into it via
  //     the account switcher but the BFF rejects writes from them,
  //     so we hide the affordance rather than land them on a
  //     write-rejected edit page.
  const { did: sessionDid, isAuthenticated } = useAuth()
  // Funding: any signed-in viewer can record a payment they were party to;
  // trusted evaluators additionally get the third-party direction (gated
  // inside the modal). The "Record funding" affordance shows for any
  // authenticated viewer.
  const canRecordFunding = isAuthenticated && !!sessionDid
  // Shown after a successful record — the receipt only appears once the
  // indexer has caught up (it's eventually consistent), so offer a refresh.
  // We recorded a receipt and it hasn't surfaced from the indexer yet — used
  // to suppress the "no receipts yet" empty state while we wait.
  const fundingRecordInFlight =
    pendingFundingUri !== null || fundingRecordPollTimedOut
  const fundingRecordedNote = pendingFundingUri ? (
    <p className="cert-detail__short-desc funding-form__recorded-note">
      Recording your funding — it will appear here shortly…
      <RefreshCw
        size={14}
        strokeWidth={2}
        aria-hidden
        className="animate-spin motion-reduce:animate-none ml-1.5 inline-block align-middle"
      />
    </p>
  ) : fundingRecordPollTimedOut ? (
    <p className="cert-detail__short-desc funding-form__recorded-note">
      Funding recorded. It is taking longer than usual to appear.
      <button
        type="button"
        className="funding-form__recorded-refresh"
        aria-label="Refresh the funding list"
        aria-busy={fundingLoading}
        disabled={fundingLoading}
        onClick={() => refetchFunding()}
      >
        <RefreshCw
          size={14}
          strokeWidth={2}
          aria-hidden
          className={
            fundingLoading ? "animate-spin motion-reduce:animate-none" : undefined
          }
        />
      </button>
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
    <Button
      variant="secondary"
      size="sm"
      className="cert-detail__section-action-btn"
      onClick={openRecordFunding}
    >
      <Plus size={14} strokeWidth={2} aria-hidden />
      Record funding
    </Button>
  ) : null
  // When acting as a group, the user can only edit certs OWNED BY
  // that group — even though the session DID is still their
  // personal identity. Without this, a member who switches into a
  // group they're part of would still see the Edit button on their
  // own personal certs, which contradicts the active identity. The
  // personal-edit branch only fires when there's no active org.
  const isCreator = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  // When the creator is acting as the group, writes route through
  // the BFF (target ≠ session); otherwise straight XRPC.
  const editTargetDid = canEditAsActiveOrg ? did : undefined
  // Group-edit affordance — the viewer is NOT a direct editor (own cert
  // or active-org owner/admin), but they ARE an owner/admin of the group
  // that owns this cert while signed in under a different identity
  // (personal, or another org). Offer an Edit button that, on confirm,
  // switches them into the owning group before opening the editor — the
  // edit page's own gate then passes and writes route through the group.
  const editAsGroup = isCreator
    ? null
    : groups.find(
        (g) =>
          g.groupDid === did &&
          (g.role === "owner" || g.role === "admin"),
      ) ?? null
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const editHref = `${recordUrl(did, "activity", rkey ?? "")}/edit`
  // Build a tab href that PRESERVES the current query params (e.g. the
  // funding "Confirmed by" filter `?confirmedRoles=`), so jumping from the
  // overview to a sub-tab via "See all" doesn't reset the filter. Mirrors the
  // top-bar tab strip's `hrefFor`.
  const tabHref = (tab: string): string | null => {
    if (!pathname) return null
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (tab === "overview") params.delete("tab")
    else params.set("tab", tab)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const fundingHref = tabHref("funding")

  // -------------------------------------------------------------------
  // Inline edit state — same pattern as the profile page. Drafts are
  // seeded from `value` when the user enters edit mode; on save we
  // PUT the record and update local mirrors so the read-only view
  // immediately reflects the change.
  // -------------------------------------------------------------------
  const [isEditing, setIsEditing] = useState(false)
  const [drafts, setDrafts] = useState({
    title: "",
    shortDescription: "",
    description: null as LinearDocument | null,
    /** Per issue #75 — these scalar meta fields are now editable
     *  inline. Date inputs use the `YYYY-MM-DD` shape browsers
     *  emit; `null` means "field cleared by the user" (save
     *  handler deletes the key). Work scope is edited as a plain
     *  string and serialised as the `WorkScopeString` lexicon
     *  variant. Complex variants (CEL, structured records),
     *  contributors, locations, and rights remain read-only —
     *  they need pickers / structured editors out of this scope. */
    workScope: "",
    startDate: "" as string,
    endDate: "" as string,
  })
  const [localValue, setLocalValue] = useState<ClaimActivity | null>(null)
  const [pendingImageBlob, setPendingImageBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] =
    useState<string | null>(null)
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Snapshot of the record value + CID at edit-start (the
   *  CID-precondition baseline for swapRecord). Captured on
   *  `handleEditClick`; consumed by the swap-aware save handler
   *  to detect concurrent edits and decide rebase vs banner
   *  (issue #71). */
  const [mountSnapshot, setMountSnapshot] = useState<{
    value: ClaimActivity
    cid: string
  } | null>(null)

  // Read values used everywhere a tab renders the cert: prefer the
  // local mirror (set after save) over the server-supplied `value`.
  const effectiveValue = localValue ?? value
  const editing = isEditing && isCreator

  const handleEditClick = useCallback(() => {
    // Seed the meta scalars from the effective value. Dates come
    // out of the lexicon as ISO strings; truncate to YYYY-MM-DD
    // for the HTML date input. evaluateWorkScope returns the
    // displayed string (handles every union variant), so seeding
    // the input with it is lossless on a round-trip when the
    // source was a `WorkScopeString` — but DOES "downgrade" a
    // CEL workScope to a plain string on save. Acceptable for
    // v1; the workScope JSX comments document the trade-off.
    const startSeed =
      typeof effectiveValue.startDate === "string"
        ? effectiveValue.startDate.slice(0, 10)
        : ""
    const endSeed =
      typeof effectiveValue.endDate === "string"
        ? effectiveValue.endDate.slice(0, 10)
        : ""
    const workScopeSeed = evaluateWorkScope(effectiveValue.workScope) ?? ""
    setDrafts({
      title: effectiveValue.title ?? "",
      shortDescription: effectiveValue.shortDescription ?? "",
      description:
        asLinearDocument(effectiveValue.description) ??
        (typeof effectiveValue.description === "string" &&
        effectiveValue.description.trim().length > 0
          ? {
              $type: "pub.leaflet.pages.linearDocument" as const,
              blocks: [
                {
                  block: {
                    $type: "pub.leaflet.blocks.text" as const,
                    plaintext: effectiveValue.description,
                  },
                },
              ],
            }
          : null),
      workScope: workScopeSeed,
      startDate: startSeed,
      endDate: endSeed,
    })
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    // Capture value + CID at edit-start as the swapRecord baseline.
    // Save handler compares fresh server reads against this to
    // detect same-field conflicts.
    setMountSnapshot({ value: effectiveValue, cid })
    setSaveError(null)
    setIsEditing(true)
  }, [effectiveValue, cid])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setSaveError(null)
  }, [])

  // ----- Destructive delete -----
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Record-level overflow menu in the mobile navbar's right slot: the owner's
  // Edit / Delete (moved off the title row on mobile) + Share / Add to list /
  // Copy AT URI. Reads as page-level chrome instead of an action on the
  // author. Desktop keeps the inline title-row Edit/Delete + the in-body
  // share menu (the navbar isn't rendered at >=800px). Placed here so it can
  // reference the edit/delete handlers defined above.
  usePageRecordMenu(
    rkey
      ? {
          targetUri: `at://${did}/org.hypercerts.claim.activity/${rkey}`,
          targetCid: cid,
          targetType: LIST_CERTS_TYPE,
          shareTab: activeTab === "overview" ? null : activeTab,
          editActions:
            !editing && (isCreator || editAsGroup)
              ? {
                  isCreator,
                  editHref,
                  editAsGroupLabel: editAsGroup
                    ? editAsGroup.displayName || editAsGroup.handle
                    : null,
                  onEditAsGroup: () => setGroupEditOpen(true),
                  onDelete: () => {
                    setDeleteError(null)
                    setDeleteOpen(true)
                  },
                }
              : null,
        }
      : null,
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!rkey) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      // Same activeOrg-aware routing the save path uses: group BFF
      // when acting as a group, xrpc proxy on the user's own repo
      // otherwise.
      const useGroupRoute = canEditAsActiveOrg
      // Group BFF takes DELETE; the xrpc proxy expects POST for
      // com.atproto.repo.deleteRecord per the lexicon.
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
          (data as { error?: string }).error ||
            `Delete failed: ${res.status}`,
        )
      }
      // Redirect away from the deleted cert. We use a hard
      // navigation (window.location) rather than router.push so
      // every client-side cache the destination page might keep
      // (profile certs/projects lists, the indexer feed cache,
      // any module-level memoised fetches) is cleared on the way
      // — otherwise the just-deleted cert can linger in the
      // profile grid until the next refresh.
      if (typeof window !== "undefined") {
        window.location.href = profileUrl(did)
      } else {
        router.push(profileUrl(did))
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Delete failed",
      )
      setIsDeleting(false)
    }
  }, [rkey, did, canEditAsActiveOrg, router])

  const handleImageFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      const blob = await uploadBlob(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      setPendingImageBlob(blob)
    },
    [editTargetDid],
  )

  const handleSave = useCallback(async () => {
    if (!rkey || !sessionDid || !isAuthenticated) {
      setSaveError("Not authenticated")
      return
    }
    if (!mountSnapshot) {
      setSaveError("Edit state lost — please refresh and try again")
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const trimmedTitle =
        drafts.title.trim() || effectiveValue.title || ""
      const trimmedShort =
        drafts.shortDescription.trim() ||
        effectiveValue.shortDescription ||
        ""

      // saveWithSwap operates on a small user-facing shape for
      // dirty-set detection. The write callback expands back to
      // the full ClaimActivity by overlaying onto the captured
      // `effectiveValue` baseline (carries forward dates,
      // contributors, work scope, rights, locations).
      // User-facing shape includes the editable scalars added in
      // #75: workScope (serialised as the lexicon's WorkScopeString
      // variant on save) and startDate / endDate. Dirty-set
      // detection diffs against the mount snapshot in this shape.
      type UserShape = {
        title: string
        shortDescription: string
        description: typeof drafts.description
        workScope: string
        startDate: string
        endDate: string
      }
      const userDrafts: UserShape = {
        title: trimmedTitle,
        shortDescription: trimmedShort,
        description: drafts.description,
        workScope: drafts.workScope.trim(),
        startDate: drafts.startDate,
        endDate: drafts.endDate,
      }
      const userMountSnapshot: UserShape = {
        title: mountSnapshot.value.title ?? "",
        shortDescription: mountSnapshot.value.shortDescription ?? "",
        description: (mountSnapshot.value.description ??
          null) as UserShape["description"],
        workScope: evaluateWorkScope(mountSnapshot.value.workScope) ?? "",
        startDate:
          typeof mountSnapshot.value.startDate === "string"
            ? mountSnapshot.value.startDate.slice(0, 10)
            : "",
        endDate:
          typeof mountSnapshot.value.endDate === "string"
            ? mountSnapshot.value.endDate.slice(0, 10)
            : "",
      }

      let nextSaved: ClaimActivity | null = null
      const result = await saveWithSwap<UserShape, UserShape>({
        mountSnapshot: userMountSnapshot,
        initialCid: mountSnapshot.cid,
        drafts: userDrafts,
        computeNext: (_serverShape, draftsArg) => draftsArg,
        write: async (next, swapRecord) => {
          const built: ClaimActivity = {
            ...effectiveValue,
            title: next.title,
            shortDescription: next.shortDescription,
          }
          if (isEmptyLongDescription(next.description)) {
            delete (built as { description?: unknown }).description
          } else if (next.description) {
            built.description = next.description
          }
          if (pendingImageBlob) {
            const imageValue: HypercertsSmallImage = {
              $type: "org.hypercerts.defs#smallImage",
              image: pendingImageBlob as unknown as BlobRef,
            }
            built.image = imageValue
          }
          // workScope — write as the WorkScopeString lexicon
          // variant; empty string drops the field. This downgrades
          // a CEL workScope to a plain string when the user edits
          // (the seed used `evaluateWorkScope` which collapses
          // every variant to its display string). Acceptable
          // trade-off for v1 — CEL workscope authoring lives in
          // a different surface anyway.
          if (next.workScope) {
            built.workScope = {
              $type: "org.hypercerts.claim.activity#workScopeString",
              scope: next.workScope,
            }
          } else {
            delete (built as { workScope?: unknown }).workScope
          }
          // Dates — store as ISO-8601 (YYYY-MM-DD is a valid
          // prefix; the lexicon accepts both date-only and
          // full timestamp shapes). Empty input drops the field.
          if (next.startDate) {
            built.startDate = next.startDate
          } else {
            delete (built as { startDate?: unknown }).startDate
          }
          if (next.endDate) {
            built.endDate = next.endDate
          } else {
            delete (built as { endDate?: unknown }).endDate
          }
          await putCertRecord(
            sessionDid,
            editTargetDid ?? sessionDid,
            rkey,
            built,
            { swapRecord },
          )
          nextSaved = built
        },
        read: async () => {
          const params = new URLSearchParams({
            repo: did,
            collection: "org.hypercerts.claim.activity",
            rkey,
          })
          const res = await fetch(
            `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
          )
          if (!res.ok) throw new Error(`Re-read failed (${res.status})`)
          const data = (await res.json()) as {
            cid: string
            value: ClaimActivity
          }
          return {
            cid: data.cid,
            value: {
              title: data.value.title ?? "",
              shortDescription: data.value.shortDescription ?? "",
              description: (data.value.description ??
                null) as UserShape["description"],
              workScope: evaluateWorkScope(data.value.workScope) ?? "",
              startDate:
                typeof data.value.startDate === "string"
                  ? data.value.startDate.slice(0, 10)
                  : "",
              endDate:
                typeof data.value.endDate === "string"
                  ? data.value.endDate.slice(0, 10)
                  : "",
            },
          }
        },
      })

      if (!result.ok) {
        saveDraft(sessionDid, "org.hypercerts.claim.activity", rkey, {
          title: trimmedTitle,
          shortDescription: trimmedShort,
          description: drafts.description,
        })
        if (result.reason === "conflict") {
          setSaveError(
            `Someone else saved while you were editing — conflicts on ${result.conflictingFields.join(", ")}. Your draft is saved locally; refresh and re-apply.`,
          )
        } else {
          setSaveError(
            "Couldn't auto-merge after several retries — your draft is saved locally; refresh to see the latest version.",
          )
        }
        return
      }

      clearDraft(sessionDid, "org.hypercerts.claim.activity", rkey)
      if (nextSaved) setLocalValue(nextSaved)
      if (pendingImagePreviewUrl) {
        setLocalImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return pendingImagePreviewUrl
        })
      }
      setPendingImagePreviewUrl(null)
      setPendingImageBlob(null)
      setIsEditing(false)
    } catch (err) {
      if (err instanceof InvalidSwapError) {
        setSaveError(
          "Someone else saved while you were editing — please refresh and try again.",
        )
      } else {
        console.error("Failed to save cert:", err)
        setSaveError(err instanceof Error ? err.message : "Failed to save activity")
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    rkey,
    did,
    sessionDid,
    isAuthenticated,
    drafts,
    effectiveValue,
    mountSnapshot,
    pendingImageBlob,
    pendingImagePreviewUrl,
    editTargetDid,
  ])

  // Revoke any outstanding object URL on unmount. Without this, a
  // user who navigates away mid-edit (or whose page unmounts after
  // save) leaks the pending preview / local mirror until the tab
  // closes. The setters above already revoke on replacement; this
  // is the unmount-side guarantee.
  //
  // Use refs (not deps) so the cleanup only fires on unmount — a
  // deps array on (pendingImagePreviewUrl, localImageUrl) would
  // revoke the prior render's URLs on every state transition,
  // including the save flow where one URL is *moved* from pending
  // to localImageUrl (revoking the URL we just promoted).
  const pendingImagePreviewUrlRef = useRef(pendingImagePreviewUrl)
  pendingImagePreviewUrlRef.current = pendingImagePreviewUrl
  const localImageUrlRef = useRef(localImageUrl)
  localImageUrlRef.current = localImageUrl
  useEffect(() => {
    return () => {
      const a = pendingImagePreviewUrlRef.current
      const b = localImageUrlRef.current
      if (a) URL.revokeObjectURL(a)
      if (b && b !== a) URL.revokeObjectURL(b)
    }
  }, [])

  // Resolution order for the displayed cert image:
  //   1. In-flight preview (object URL created the instant the user
  //      picked a new image — atproto PDSes don't serve a blob via
  //      getBlob until the record references it, so we bridge with
  //      the local file).
  //   2. Post-save local mirror.
  //   3. Re-resolve from the local mirror's record if it exists.
  //   4. Original server value.
  const effectiveImageUrl =
    pendingImagePreviewUrl ??
    localImageUrl ??
    (localValue?.image
      ? resolveActivityImageUrl(localValue.image, did)
      : baseImageUrl)

  // Headline (shared across all tabs) — title row + byline only.
  // The shortDescription used to be nested here, but that meant the
  // Overview tab's first body element appeared 12px below the byline
  // (the headline's internal gap) while the Description and
  // Contributors tabs' first content sat 24px below (the main
  // pane's `gap`). Pulling shortDescription OUT of the headline so
  // it becomes a sibling section in `cert-detail__main` makes all
  // three tabs start their content at the same vertical position.
  const headline = (
    <header className="cert-detail__headline">
      {/* Mobile: "Activity" eyebrow + date created (right-aligned) above
          the title — mirrors the project page's "Project" eyebrow row.
          Hidden on desktop, where the date shows in the headline columns. */}
      <div className="cert-detail__eyebrow-row">
        <span className="cert-detail__eyebrow" aria-hidden="true">
          Activity
        </span>
        {value.createdAt ? (
          <time
            className="cert-detail__eyebrow-date"
            dateTime={value.createdAt}
            title={value.createdAt}
          >
            {createdAbsolute}
          </time>
        ) : null}
      </div>
      <div className="cert-detail__title-row">
        {editing ? (
          // Bare/flush <Input> for the inline title edit. The detail
          // page keeps the full 1.875rem serif headline scale (the
          // create form shrinks it to 1.375rem); carried inline here
          // since the legacy `.cert-detail__title-input` rule is now
          // dead. borderWeight="hover" reproduces its 1.5px
          // --border-hover / --fg-primary focus chrome.
          <Input
            flush
            size="bare"
            borderWeight="hover"
            type="text"
            className="flex-[1_1_auto] min-w-0 font-headline !text-[1.875rem] font-bold !leading-[1.15] tracking-[-0.015em] text-[var(--fg-primary)] !px-2.5 py-1"
            value={drafts.title}
            maxLength={256}
            placeholder="Activity title"
            aria-label="Activity title"
            onChange={(e) =>
              setDrafts((d) => ({ ...d, title: e.target.value }))
            }
          />
        ) : (
          <h1 className="cert-detail__title">{effectiveValue.title}</h1>
        )}
        {!editing && rkey ? (
          // Three-dot record menu — DESKTOP only, right-aligned on the title
          // row (the title is flex:1, so it pushes this to the end). Folds the
          // owner's Edit / Delete (when available) in with Share / Add to list
          // / Copy AT URI, replacing the old separate Edit + Delete buttons.
          // On mobile the same menu lives in the navbar (usePageRecordMenu);
          // this cluster is hidden at <=799px via `.cert-detail__title-actions`.
          <span className="cert-detail__title-actions">
            <AddToListMenu
              targetUri={`at://${did}/org.hypercerts.claim.activity/${rkey}`}
              targetCid={cid}
              targetType={LIST_CERTS_TYPE}
              shareTab={activeTab === "overview" ? null : activeTab}
              editActions={
                isCreator || editAsGroup
                  ? {
                      isCreator,
                      editHref,
                      editAsGroupLabel: editAsGroup
                        ? editAsGroup.displayName || editAsGroup.handle
                        : null,
                      onEditAsGroup: () => setGroupEditOpen(true),
                      onDelete: () => {
                        setDeleteError(null)
                        setDeleteOpen(true)
                      },
                    }
                  : null
              }
            />
          </span>
        ) : null}
      </div>
      {/* No `action` here: on mobile the record menu lives in the navbar
          (usePageRecordMenu), on desktop in the time-period row below. */}
      <CertHeadlineColumns
        did={did}
        rkey={rkey}
        createdAt={effectiveValue.createdAt}
        formattedDate={createdAbsolute}
      />
    </header>
  )

  // Slim headline — used by every tab except Overview: the activity title
  // with the author pulled up onto the same row (right-aligned, no "Author"
  // label) and the edit/delete actions tucked into a three-dot menu. No
  // date-created / project byline (those live on the Overview tab).
  const slimHeadline = (
    <SlimTabHeadline
      did={did}
      title={effectiveValue.title}
      isCreator={isCreator}
      editHref={editHref}
      editAsGroupLabel={
        editAsGroup ? editAsGroup.displayName || editAsGroup.handle : null
      }
      onEditAsGroup={() => setGroupEditOpen(true)}
      onDelete={() => {
        setDeleteError(null)
        setDeleteOpen(true)
      }}
    />
  )

  // Overview-only shortDescription section. Lives BELOW the headline
  // (with `cert-detail__main`'s 24px gap) so its top edge aligns
  // with the first content row on the Description / Contributors
  // tabs.
  // Summary heading row — just the label now; the "Read full description"
  // affordance moved to a centered button below the summary (see
  // `descriptionReveal`).
  const summaryHead = (
    <div className="cert-detail__summary-head">
      <span className="cert-detail__meta-label">Summary</span>
    </div>
  )

  const shortDescSection =
    activeTab !== "overview" ? null : editing ? (
      <section className="cert-detail__section cert-detail__section--summary">
        {summaryHead}
        <textarea
          className="cert-detail__short-desc-input"
          value={drafts.shortDescription}
          maxLength={512}
          placeholder="A short description (one or two lines)…"
          aria-label="Short description"
          onChange={(e) =>
            setDrafts((d) => ({ ...d, shortDescription: e.target.value }))
          }
          rows={3}
        />
      </section>
    ) : effectiveValue.shortDescription ? (
      <section className="cert-detail__section cert-detail__section--summary">
        {summaryHead}
        <p className="cert-detail__short-desc">
          {effectiveValue.shortDescription}
        </p>
      </section>
    ) : null

  // Overview "Read full description": a centered disclosure button below the
  // summary that reveals the full rich description inline as its own
  // Description section, and collapses it again. The chevron encodes the
  // behaviour — it points down to expand and rotates to point up once open
  // (rotation driven off the button's aria-expanded in CSS), so the control
  // reads as an in-place toggle rather than a navigation. Hidden while editing
  // (the Description editor lives on its own tab) and when there's no rich
  // description to show.
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
          size={15}
          strokeWidth={2}
          aria-hidden
          className="cert-detail__desc-toggle-chevron"
        />
      </Button>
    </div>
  )

  // While editing, the full-description editor lives here on the overview
  // (the dedicated Description tab was removed — the overview now owns both
  // reading and editing the description). Otherwise: the centered toggle
  // reveals the read-only description inline.
  const descriptionReveal = editing ? (
    <section className="cert-detail__section">
      <div className="cert-detail__section-header">
        <h2 className="cert-detail__section-title">Description</h2>
      </div>
      <LeafletEditor
        value={drafts.description}
        onChange={(next) => setDrafts((d) => ({ ...d, description: next }))}
        placeholder="Full description of this activity."
        ariaLabel="Activity description"
        did={did}
        onImageUpload={(file) =>
          uploadBlob(file, editTargetDid ? { targetDid: editTargetDid } : undefined)
        }
      />
    </section>
  ) : !showFullDescription ? null : descriptionExpanded ? (
    <>
      <section className="cert-detail__section">
        <div className="cert-detail__section-header">
          <h2 className="cert-detail__section-title">Description</h2>
        </div>
        <LeafletDocument value={effectiveValue.description} did={did} />
      </section>
      {descriptionToggle}
    </>
  ) : (
    descriptionToggle
  )

  // The Contributors list — shown on the Contributors tab beneath the
  // deluxe board.
  const contributorsSection = (
    <section className="cert-detail__section">
      <div className="cert-detail__section-header">
        <h2 className="cert-detail__section-title">Contributors</h2>
        <span className="cert-detail__section-count">{contributorCount}</span>
      </div>
      {contributorCount > 0 ? (
        (() => {
          return (
            <>
              {contributors.some((c) => c.contributionWeight != null) ? (
                <ContributorWeightHeader />
              ) : null}
              <ul className="cert-detail__contributors">
                {contributors.map((c, i) => {
                  const roleText = contributionRoleText(c.contributionDetails)
                  return (
                    <ContributorRow
                      key={contributorKey(c, i)}
                      contributor={c}
                      role={roleText}
                      weight={
                        weightPercents.get(i) ?? c.contributionWeight ?? null
                      }
                    />
                  )
                })}
              </ul>
            </>
          )
        })()
      ) : (
        <p className="cert-detail__short-desc">No contributors listed.</p>
      )}
    </section>
  )

  return (
    <>
      {/* Editing banner sits ABOVE the cert-detail grid so it spans
          the full content width. Placing it inside the article made
          it a grid child of the 2-column layout and squashed it into
          the left rail. */}
      {editing ? (
        <EditBanner
          label="Editing activity"
          error={saveError}
          isSaving={isSaving}
          onCancel={handleCancelEdit}
          onSave={handleSave}
        />
      ) : null}

      <article
        className={`page-layout cert-detail--wide cert-detail--tab-${activeTab}${editing ? " cert-detail--editing" : ""}`}
      >
      <aside className="cert-detail__aside" aria-label="Activity details">
        {/* No placeholder in the read-only view: the image box renders
            only when there's a real image (or in edit mode, where the
            placeholder is the upload target). */}
        {(effectiveImageUrl && !imageFailed) || editing ? (
          <div
            className={
              editing
                ? "cert-detail__image cert-detail__image--editing"
                : "cert-detail__image"
            }
          >
            {effectiveImageUrl && !imageFailed ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={effectiveImageUrl}
                alt=""
                className="cert-detail__image-img"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <CertIcon
                size={56}
                strokeWidth={1.25}
                className="cert-detail__image-placeholder-icon"
                aria-hidden
              />
            )}
            {editing ? (
              <ImageEditOverlay
                onFile={handleImageFile}
                hasPending={!!pendingImageBlob}
              />
            ) : null}
          </div>
        ) : null}

        <dl className="cert-detail__meta">
          {/* "Created" lives in the headline byline now — no need to
              repeat it in the aside meta list. */}
          <div className="cert-detail__meta-row cert-detail__meta-row--timeperiod">
            <dt className="cert-detail__meta-label">
              <span className="cert-detail__meta-label-text">
                <Calendar size={11} strokeWidth={2} aria-hidden />
                Time period
              </span>
            </dt>
            <dd className="cert-detail__meta-value">
              {editing ? (
                /* Two date inputs in place of the rendered label.
                   Empty input drops the field on save (#75). */
                <span className="cert-detail__meta-edit">
                  {/* `!w-auto max-w-full min-w-0` reproduces the legacy
                      `.cert-detail__meta-input` sizing (no fixed width,
                      max-width:100%, min-width:0) — the primitive's
                      flush `w-full` would otherwise stretch each date
                      field inside this inline-flex meta-edit row. */}
                  <Input
                    flush
                    density="compact"
                    borderWeight="hover"
                    type="date"
                    aria-label="Start date"
                    className="!w-auto max-w-full min-w-0"
                    value={drafts.startDate}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, startDate: e.target.value }))
                    }
                  />
                  <span aria-hidden="true">–</span>
                  <Input
                    flush
                    density="compact"
                    borderWeight="hover"
                    type="date"
                    aria-label="End date"
                    className="!w-auto max-w-full min-w-0"
                    value={drafts.endDate}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, endDate: e.target.value }))
                    }
                  />
                </span>
              ) : (
                timePeriodLabel
              )}
            </dd>
          </div>

          {editing || workScopeLabel ? (
            <div className="cert-detail__meta-row cert-detail__meta-row--workscope">
              <dt className="cert-detail__meta-label">
                <Target size={11} strokeWidth={2} aria-hidden />
                Work scope
              </dt>
              <dd className="cert-detail__meta-value">
                {editing ? (
                  /* Plain text input. Serialised as the
                     `WorkScopeString` lexicon variant on save;
                     complex CEL workscope authoring lives
                     elsewhere (#75 trade-off).
                     `!w-auto max-w-full min-w-0` reproduces the legacy
                     `.cert-detail__meta-input` sizing (intrinsic width,
                     not the primitive's flush `w-full`). */
                  <Input
                    flush
                    density="compact"
                    borderWeight="hover"
                    type="text"
                    aria-label="Work scope"
                    className="!w-auto max-w-full min-w-0"
                    placeholder="e.g. mentorship, code review…"
                    value={drafts.workScope}
                    maxLength={256}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, workScope: e.target.value }))
                    }
                  />
                ) : (
                  workScopeLabel
                )}
              </dd>
            </div>
          ) : null}

          {/* Contributors row — preview of up to 5, with a "Show all"
              tail link into the dedicated Contributors tab when there
              are more. Lives in the aside (not the main pane) so the
              top of the main column stays reserved for narrative
              content. NOT tab-gated: the aside is identical on every
              cert tab. */}
          {contributorCount > 0
            ? (() => {
                const ASIDE_CONTRIB_PREVIEW = 5
                const shown = contributors.slice(0, ASIDE_CONTRIB_PREVIEW)
                const contributorsHref = tabHref("contributors")
                const hasAnyWeight = shown.some(
                  (c) => c.contributionWeight != null,
                )
                // Percentages computed across the FULL list so the %
                // column adds to 100 even when only the first 5 show
                // (`weightPercents` above is memoized on `contributors`).
                return (
                  <div className="cert-detail__meta-row cert-detail__meta-row--contributors">
                    <dt className="cert-detail__meta-label cert-detail__meta-label--with-action">
                      <span className="cert-detail__meta-label-text">
                        <Users size={11} strokeWidth={2} aria-hidden />
                        Contributors
                        <span className="cert-detail__meta-count">
                          {contributorCount}
                        </span>
                      </span>
                      {contributorsHref ? (
                        <TransitionLink
                          href={contributorsHref}
                          replace
                          className="cert-detail__section-see-all"
                        >
                          See all →
                        </TransitionLink>
                      ) : null}
                    </dt>
                    <dd className="cert-detail__meta-value">
                      {hasAnyWeight ? <ContributorWeightHeader /> : null}
                      <ul className="cert-detail__contributors cert-detail__contributors--aside">
                        {shown.map((c, i) => {
                          const roleText = contributionRoleText(
                            c.contributionDetails,
                          )
                          return (
                            <ContributorRow
                              key={contributorKey(c, i)}
                              contributor={c}
                              role={roleText}
                              weight={
                                weightPercents.get(i) ??
                                c.contributionWeight ??
                                null
                              }
                            />
                          )
                        })}
                      </ul>
                    </dd>
                  </div>
                )
              })()
            : null}

          {/* Rights row — sits at the bottom of the meta list. The
              other meta rows are quick scalar facts; Rights
              references an external record and reads as a
              less-frequent reference. */}
          {value.rights ? (
            <div className="cert-detail__meta-row cert-detail__meta-row--rights">
              <dt className="cert-detail__meta-label">
                <FileText size={11} strokeWidth={2} aria-hidden />
                Rights
              </dt>
              <dd className="cert-detail__meta-value">
                <button
                  type="button"
                  className="cert-detail__rights-link"
                  onClick={() => setRightsModalOpen(true)}
                  title="View rights details"
                >
                  {rightsName ? (
                    rightsName
                  ) : rightsLoading ? (
                    <span className="cert-detail__meta-aux">Loading…</span>
                  ) : (
                    <span className="cert-detail__uri">{value.rights.uri}</span>
                  )}
                </button>
              </dd>
            </div>
          ) : null}
        </dl>
      </aside>

      <div className="page-layout__main cert-detail__main">
        {/* Title stays put across tabs (the active tab shows in the top
            bar's second row); only the per-tab content below slides. Every
            tab except Overview uses the slim headline (author on the title
            row, actions in a three-dot menu, no date/project byline);
            Overview keeps the full headline with the byline columns. */}
        {activeTab === "overview" ? headline : slimHeadline}

        {/* Short description / summary. Rendered as a SIBLING of the tab
            panel (not inside it) so the mobile single-column order can place
            the facts meta rows (time period / work scope / contributors /
            rights) between the summary and the updates. Overview-only — null
            on the other tabs. On desktop it sits in the same spot (right
            after the headline, before the tab content). */}
        {shortDescSection}

        <TabPanelTransition
          className="cert-detail__content"
          activeKey={activeTab}
          order={CERT_DETAIL_TABS.map((t) => t.key)}
        >
        {activeTab === "overview" ? (
          <>
            {/* Read-full-description: centered button below the summary that
                reveals the full description inline as a Description section. */}
            {descriptionReveal}
            {/* Updates preview sits above Locations: after the cert's
                narrative (summary / read-full link) the reader sees
                the latest activity, then the where. Capped at one
                card here — the "See all" link jumps to the dedicated
                Updates tab for the rest. */}
            {rkey ? (
              <ContextUpdates
                subjectUri={`at://${did}/org.hypercerts.claim.activity/${rkey}`}
                variant="overview"
                maxItems={1}
                seeAllHref={tabHref("updates")}
              />
            ) : null}

            {/* Funding preview — up to 5 receipts for this activity, with a
                "See all" link into the dedicated Funding tab. Also shown
                (header only) to a signed-in viewer with no receipts yet, so
                they can record one. Read-only otherwise — no bearing on the
                inline-edit state. The `for` tail is omitted (it's this
                activity) and text wallet-address funders are surfaced. */}
            {fundingReceipts.length > 0 || canRecordFunding ? (
              <section className="cert-detail__section">
                <div className="cert-detail__section-header">
                  <h2 className="cert-detail__section-title">Funding</h2>
                  {fundingReceipts.length > 0 ? (
                    <span className="cert-detail__section-count">
                      {shownFundingCount}
                    </span>
                  ) : null}
                  <div className="cert-detail__section-actions">
                    {recordFundingControl}
                    {fundingReceipts.length > 0 ? confirmedByControl : null}
                    {fundingHref && fundingReceipts.length > 0 ? (
                      <TransitionLink
                        href={fundingHref}
                        replace
                        className="cert-detail__section-see-all"
                      >
                        See all →
                      </TransitionLink>
                    ) : null}
                  </div>
                </div>
                {fundingRecordedNote}
                {recipientConfirmedNote}
                {fundingReceipts.length === 0 ? (
                  fundingRecordInFlight ? null : (
                    <p className="cert-detail__short-desc cert-detail__funding-empty">
                      No funding receipts for this activity yet.
                    </p>
                  )
                ) : filteredFunding.length > 0 ? (
                  <ul className="cert-detail__funding-list">
                    <li>
                      <FundingReceiptHeader showFor={false} />
                    </li>
                    {filteredFunding.slice(0, 5).map((r) => (
                      <li key={r.uri}>
                        <FundingReceiptRow
                          receipt={r}
                          showTextParties
                          showFor={false}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cert-detail__short-desc cert-detail__funding-empty">
                    No funding receipts match this filter.
                  </p>
                )}
              </section>
            ) : null}

            {/* Locations + map. Overview-only (the main pane is
                tab-gated); the aside no longer carries a Locations
                row.
                Contributors moved to the aside meta-list — see the
                Contributors row above (`<dt>Contributors</dt>`).
                Project association is surfaced in the three-column
                byline below the title (see `<CertHeadlineColumns>`),
                so the older full-width Projects section is gone — it
                would have duplicated the headline Project column. */}
            {locations.length > 0 ? (
              <section className="cert-detail__section cert-detail__section--locations">
                <span className="cert-detail__meta-label">
                  <MapPin size={11} strokeWidth={2} aria-hidden />
                  Locations
                  <span className="cert-detail__meta-count">
                    {locations.length}
                  </span>
                </span>
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
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Funding</h2>
              {fundingReceipts.length > 0 ? (
                <span className="cert-detail__section-count">
                  {shownFundingCount}
                </span>
              ) : null}
              {recordFundingControl || fundingReceipts.length > 0 ? (
                <div className="cert-detail__section-actions">
                  {recordFundingControl}
                  {fundingReceipts.length > 0 ? confirmedByControl : null}
                </div>
              ) : null}
            </div>
            {fundingRecordedNote}
            {recipientConfirmedNote}
            {fundingLoading && fundingReceipts.length === 0 ? (
              <div className="cert-detail__funding-loading">
                <LoadingSpinner size="sm" />
              </div>
            ) : fundingReceipts.length === 0 ? (
              fundingRecordInFlight ? null : (
                <p className="cert-detail__short-desc cert-detail__funding-empty">
                  No funding receipts for this activity yet.
                </p>
              )
            ) : filteredFunding.length > 0 ? (
              <ul className="cert-detail__funding-list">
                <li>
                  <FundingReceiptHeader showFor={false} />
                </li>
                {filteredFunding.map((r) => (
                  <li key={r.uri}>
                    <FundingReceiptRow
                      receipt={r}
                      showTextParties
                      showFor={false}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cert-detail__short-desc cert-detail__funding-empty">
                No funding receipts match this filter.
              </p>
            )}
          </section>
        ) : activeTab === "updates" ? (
          rkey ? (
            <ContextUpdates
              subjectUri={`at://${did}/org.hypercerts.claim.activity/${rkey}`}
              variant="full"
              canEdit={isCreator || !!editAsGroup}
              viewerDid={sessionDid}
            />
          ) : null
        ) : null}
        </TabPanelTransition>
      </div>
    </article>
    {deleteOpen ? (
      <DeleteRecordDialog
        title="Delete this activity"
        recordName={effectiveValue.title || ""}
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
        message={`This activity is published by ${editAsGroup.displayName || editAsGroup.handle}. You'll switch to acting as that group to edit it — your changes are saved as the group, not your personal account.`}
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
    {recordFundingOpen && sessionDid && rkey
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
                uri: `at://${did}/org.hypercerts.claim.activity/${rkey}`,
                cid,
                title: effectiveValue.title || undefined,
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

/**
 * Read the trailing rkey segment off the current URL. The cert detail
 * page sits at `/activity/[did]/[rkey]`, so we slice the last
 * pathname segment — decoded so it matches what the page already
 * normalised through `decodeURIComponent`. Returns null until the
 * window object is available (SSR pass).
 */
function useRouteRkey(): string | null {
  const [rkey, setRkey] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const segments = window.location.pathname.split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) {
      setRkey(null)
      return
    }
    try {
      setRkey(decodeURIComponent(last))
    } catch {
      setRkey(last)
    }
  }, [])
  return rkey
}

/**
 * Right-aligned `%` column heading rendered above a contributors
 * list when at least one row carries a `contributionWeight`. The
 * pill-shaped weight chips below align to the row's right edge, so
 * the `%` sits over that column to label what the numbers mean.
 * Hovering surfaces the full sentence via a native browser tooltip
 * (`title`); the `aria-label` mirrors the same text for AT.
 */
function ContributorWeightHeader() {
  return (
    <div
      className="cert-detail__contributors-weight-header"
      title="Relative weight of the contribution"
      aria-label="Relative weight of the contribution"
    >
      <span aria-hidden="true">%</span>
    </div>
  )
}

/* ---------- Contributor row ----------
 *
 * Compact row for the cert detail contributors grid. Resolves the
 * contributor identity the same way `ActivityContributor` does — see
 * `useContributorInfo` / `useContributorInformationRecord` — but renders with
 * the `cert-detail__contributor-*` class set so it inherits the new
 * pill-hover styling rather than the older `activity-detail__contributor-*`
 * rules in feed.css.
 */

interface ContributorRowProps {
  readonly contributor: ActivityContributorType
  readonly role: string | null
  readonly weight: string | null
}

function classifyContributorIdentity(id: unknown): {
  inlineIdentity: string | null
  strongRefUri: string | null
} {
  if (id == null) return { inlineIdentity: null, strongRefUri: null }
  if (typeof id === "string") {
    return { inlineIdentity: id, strongRefUri: null }
  }
  if (typeof id !== "object") {
    return { inlineIdentity: null, strongRefUri: null }
  }
  const obj = id as Record<string, unknown>
  if (typeof obj.identity === "string") {
    return { inlineIdentity: obj.identity, strongRefUri: null }
  }
  if (typeof obj.uri === "string" && obj.uri.startsWith("at://")) {
    return { inlineIdentity: null, strongRefUri: obj.uri }
  }
  return { inlineIdentity: null, strongRefUri: null }
}

const ContributorRow = memo(function ContributorRow({
  contributor,
  role,
  weight,
}: ContributorRowProps) {
  const { inlineIdentity, strongRefUri } = classifyContributorIdentity(
    contributor.contributorIdentity,
  )

  const { record: contribInfo, isLoading: contribInfoLoading } =
    useContributorInformationRecord(strongRefUri)

  const atprotoCandidate =
    inlineIdentity ??
    (contribInfo?.identifier && isAtprotoIdentity(contribInfo.identifier)
      ? contribInfo.identifier
      : null)

  const { info, isLoading: atprotoLoading } =
    useContributorInfo(atprotoCandidate)

  const isLoading = contribInfoLoading || atprotoLoading

  const fallbackLabel = strongRefUri ? "Unknown contributor" : "Anonymous"
  const displayName =
    info?.displayName ||
    contribInfo?.displayName ||
    (inlineIdentity && !isAtprotoIdentity(inlineIdentity)
      ? inlineIdentity
      : null) ||
    fallbackLabel

  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const avatarUrl = info?.avatarUrl || contribInfo?.image?.uri || null
  const profileHref = info?.did
    ? profileUrl(info.handle || info.did)
    : null
  const initials = getInitials(
    info?.displayName || contribInfo?.displayName || null,
    handle,
  )

  const hasAnyHydratedField =
    !!info?.did ||
    !!contribInfo?.displayName ||
    !!contribInfo?.image?.uri ||
    !!inlineIdentity

  if (isLoading && !hasAnyHydratedField) {
    return (
      <li
        className="cert-detail__contributor cert-detail__contributor--skeleton"
        aria-hidden="true"
      >
        <div className="cert-detail__contributor-avatar-skel" />
        <div className="cert-detail__contributor-meta">
          <div className="cert-detail__contributor-name-skel" />
          <div className="cert-detail__contributor-handle-skel" />
        </div>
        {weight ? (
          <span className="cert-detail__contributor-weight">{weight}</span>
        ) : null}
      </li>
    )
  }

  const body = (
    <>
      <Avatar
        size="sm"
        src={avatarUrl || undefined}
        alt=""
        fallbackInitials={initials}
      />
      <span className="cert-detail__contributor-meta">
        <span className="cert-detail__contributor-name">
          {displayName}
          {role ? (
            <span className="cert-detail__contributor-role"> · {role}</span>
          ) : null}
        </span>
        {handle ? (
          <span className="cert-detail__contributor-handle">@{handle}</span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="cert-detail__contributor">
      {profileHref ? (
        <Link
          href={profileHref}
          className="cert-detail__contributor-link"
          aria-label={`View ${displayName}'s profile`}
        >
          {body}
        </Link>
      ) : (
        <span className="cert-detail__contributor-link cert-detail__contributor-link--static">
          {body}
        </span>
      )}
      {weight ? (
        <span className="cert-detail__contributor-weight">{weight}</span>
      ) : null}
    </li>
  )
})

/**
 * Slim headline used by every tab except Overview (Description /
 * Contributors / Funding / Updates): the activity title with the author
 * pulled onto the same row (right-aligned, no "Author" label) and the owner
 * actions (Edit / Delete) collapsed into a three-dot menu. No date-created /
 * project byline — that detail lives on the Overview tab's full headline.
 */
function SlimTabHeadline({
  did,
  title,
  isCreator,
  editHref,
  editAsGroupLabel,
  onEditAsGroup,
  onDelete,
}: {
  did: string
  title: string
  isCreator: boolean
  editHref: string
  /** Display label of the group the viewer may edit as, or null. */
  editAsGroupLabel: string | null
  onEditAsGroup: () => void
  onDelete: () => void
}) {
  const router = useRouter()
  const { info, isLoading: authorLoading } = useAuthorInfo(did)
  const showMenu = isCreator || !!editAsGroupLabel

  const displayName = info?.displayName || info?.handle || "Anonymous"
  const profileHref = profileUrl(info?.handle || did)

  return (
    <header className="cert-detail__headline cert-detail__headline--slim">
      <div className="cert-detail__title-row">
        <h1 className="cert-detail__title">{title}</h1>

        {/* Author + actions sit together at the right edge; the author's
            own content stays left-aligned (avatar then name/handle). The
            trailing row stretches so the menu button matches the author's
            height. */}
        <div className="cert-slim-headline__trailing">
          {!authorLoading && info ? (
            <Link
              href={profileHref}
              className="cert-detail__headline-author cert-slim-headline__author"
              aria-label={`View ${displayName}'s profile`}
            >
              <Avatar
                size="sm"
                src={info.avatarUrl || undefined}
                alt=""
                fallbackInitials={getInitials(info.displayName, info.handle)}
              />
              <span className="cert-detail__headline-author-meta">
                <span className="cert-detail__headline-name">
                  {displayName}
                </span>
                {info.handle ? (
                  <span className="cert-detail__headline-handle">
                    @{info.handle}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : null}

          {showMenu ? (
            <Popover>
              <PopoverTrigger>
                <Button
                  size="icon"
                  variant="ghost"
                  className="cert-slim-headline__menu"
                  aria-label="Activity actions"
                >
                  <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end">
                {isCreator ? (
                  <PopoverItem onClick={() => router.push(editHref)}>
                    <Pencil size={14} strokeWidth={1.75} aria-hidden /> Edit
                  </PopoverItem>
                ) : (
                  <PopoverItem onClick={onEditAsGroup}>
                    <Pencil size={14} strokeWidth={1.75} aria-hidden /> Edit as{" "}
                    {editAsGroupLabel}
                  </PopoverItem>
                )}
                {isCreator ? (
                  <PopoverItem onClick={onDelete}>
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden /> Delete
                  </PopoverItem>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>
    </header>
  )
}

/**
 * Three-column byline below the cert title — invisible grid (no
 * borders, no card chrome) with three small labelled cells:
 *
 *   Date created · Author · Project
 *
 * Each cell carries the same `cert-detail__meta-label` styling used
 * in the aside meta list so the three blocks read as a peer of the
 * Work scope / Locations / Rights metadata that lives on the right.
 *
 * "Project" surfaces the first project that contains this cert
 * (via the existing `useCertProjects` hook, same data source as the
 * main-pane Projects section below — module-cached so the lookup
 * doesn't double-fire). When the cert isn't in any project the
 * column renders a quiet em-dash so the three columns stay aligned.
 *
 * Below ~640px the grid collapses to a single-column stack — the
 * column track widths can't shrink further without truncating the
 * author handle or the project title past readability.
 */
function CertHeadlineColumns({
  did,
  rkey,
  createdAt,
  formattedDate,
  action,
}: {
  did: string
  rkey: string | null
  createdAt: string
  formattedDate: string
  /** Trailing control (the three-dot menu) shown on the author's row,
   *  right-aligned, on mobile. */
  action?: ReactNode
}) {
  const { info, isLoading: authorLoading } = useAuthorInfo(did)
  const { projects } = useCertProjects(did, rkey)

  return (
    <div className="cert-detail__headline-cols">
      <div className="cert-detail__headline-col cert-detail__headline-col--author">
        <span className="cert-detail__meta-label">Author</span>
        {authorLoading || !info ? (
          <span
            className="cert-detail__headline-col-value cert-detail__headline-col-value--skel"
            aria-hidden="true"
          />
        ) : (
          (() => {
            const displayName = info.displayName || info.handle || "Anonymous"
            const initials = getInitials(info.displayName, info.handle)
            const profileHref = profileUrl(info.handle || did)
            return (
              <Link
                href={profileHref}
                className="cert-detail__headline-author"
                aria-label={`View ${displayName}'s profile`}
              >
                <Avatar
                  size="sm"
                  src={info.avatarUrl || undefined}
                  alt=""
                  fallbackInitials={initials}
                />
                <span className="cert-detail__headline-author-meta">
                  <span className="cert-detail__headline-name">
                    {displayName}
                  </span>
                  {info.handle ? (
                    <span className="cert-detail__headline-handle">
                      @{info.handle}
                    </span>
                  ) : null}
                </span>
              </Link>
            )
          })()
        )}
      </div>

      {action ? (
        <div className="cert-detail__headline-action">{action}</div>
      ) : null}

      <div className="cert-detail__headline-col cert-detail__headline-col--date">
        <span className="cert-detail__meta-label">Date created</span>
        <time
          dateTime={createdAt}
          className="cert-detail__headline-col-value"
          title={createdAt}
        >
          {formattedDate}
        </time>
      </div>

      <div className="cert-detail__headline-col">
        <span className="cert-detail__meta-label">Project</span>
        {projects.length === 0 ? (
          <span className="cert-detail__headline-col-value cert-detail__meta-aux">
            —
          </span>
        ) : (
          (() => {
            // First-project preview — same scope-rule the Projects
            // section in the main pane uses (single primary
            // association for the heads-up byline). A "+N more"
            // count surfaces when the cert belongs to additional
            // projects so the reader knows to scroll down to the
            // full list.
            const first = projects[0]
            const remaining = projects.length - 1
            const firstParts = first.uri.match(
              /^at:\/\/([^/]+)\/[^/]+\/(.+)$/,
            )
            const firstHref = firstParts
              ? recordUrl(firstParts[1], "project", firstParts[2])
              : null
            const v = first.value as Record<string, unknown>
            const title =
              (typeof v.title === "string" && v.title.length > 0
                ? v.title
                : null) ||
              (typeof v.name === "string" && v.name.length > 0
                ? v.name
                : null) ||
              "Untitled project"
            // Image precedence mirrors the home-feed CollectionPreview
            // and explore-page ProjectListRow: avatar (primary
            // identity image) → image (legacy field) → banner
            // (decorative). Resolved against the project's own DID
            // so foreign-PDS blobs come through the xrpc proxy.
            const projectDid = firstParts ? firstParts[1] : ""
            const rawImage = v.avatar ?? v.image ?? v.banner
            const imageUrl =
              rawImage && projectDid
                ? resolveActivityImageUrl(
                    rawImage as Parameters<typeof resolveActivityImageUrl>[0],
                    projectDid,
                  )
                : null
            const thumb = (
              <span
                className="cert-detail__headline-project-thumb"
                aria-hidden="true"
              >
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageUrl}
                    alt=""
                    className="cert-detail__headline-project-thumb-img"
                  />
                ) : null}
              </span>
            )
            const innerBody = (
              <>
                {thumb}
                <span className="cert-detail__headline-project-title">
                  {title}
                </span>
              </>
            )
            const label = firstHref ? (
              <Link
                href={firstHref}
                className="cert-detail__headline-project-link"
              >
                {innerBody}
              </Link>
            ) : (
              <span className="cert-detail__headline-project-link cert-detail__headline-project-link--static">
                {innerBody}
              </span>
            )
            return (
              <span className="cert-detail__headline-col-value cert-detail__headline-project-value">
                {label}
                {remaining > 0 ? (
                  <span className="cert-detail__meta-aux"> +{remaining}</span>
                ) : null}
              </span>
            )
          })()
        )}
      </div>
    </div>
  )
}

