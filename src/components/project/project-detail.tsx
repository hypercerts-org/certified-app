"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { profileUrl, recordUrl } from "@/lib/urls"
import { usePageTitle, usePageRecordMenu } from "@/lib/navbar-context"
import Link from "next/link"
import { TransitionLink } from "@/lib/view-transitions"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import { authFetch } from "@/lib/auth/fetch"
import {
  FolderGit2,
  Inbox,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import ActivityAuthor from "@/components/feed/activity-author"
import ActivityCard from "@/components/feed/activity-card"
import ActivityContributor from "@/components/feed/activity-contributor"
import CertLocationsMap from "@/components/feed/cert-locations-map"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import EditBanner from "@/components/ui/edit-banner"
import EmptyState from "@/components/ui/empty-state"
import Tooltip from "@/components/ui/tooltip"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import CertSearch, { type CertSearchResult } from "@/components/search/cert-search"
import AddToListMenu from "@/components/lists/add-to-list-menu"
import { LIST_PROJECTS_TYPE } from "@/lib/atproto/typed-lists"
import ContextUpdates from "@/components/context/context-updates"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useProjectItems } from "@/hooks/use-project-items"
import { useContextUpdates } from "@/hooks/use-context-updates"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import CertListRow from "@/components/explore-page/cert-list-row"
import {
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { putProjectRecord } from "@/lib/atproto/project"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { saveWithSwap } from "@/lib/atproto/save-with-swap"
import { saveDraft } from "@/lib/utils/swap-drafts"
import { uploadBlob, type UploadedBlob } from "@/lib/atproto/profile"
import { asLinearDocument, isEmptyLongDescription } from "@/lib/leaflet/guards"
import { formatShortDate } from "@/lib/utils/format-date"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { CollectionValue } from "@/lib/atproto/collection"
import type { HypercertsLargeImage } from "@/lib/atproto/types"
import type {
  ActivityContributor as ActivityContributorType,
  ActivityRecord,
} from "@/lib/atproto/activity-types"
import type { BlobRef } from "@atproto/api"

/** How many cert cards to show on the Overview tab's preview row.
 *  Set to 3 to match the widest viewport's grid track count — at
 *  ≥900px the preview is exactly one row; on narrower viewports it
 *  wraps to two rows (still a compact summary). The "See all" link
 *  in the section header takes the user to the dedicated Certs tab
 *  for the full grid. */
const OVERVIEW_CERT_PREVIEW = 10

interface ProjectDetailProps {
  did: string
  rkey: string
  value: CollectionValue
  /** CID of the record at read time. Threaded into `putRecord` as
   *  `swapRecord` so a concurrent edit in another tab can't silently
   *  clobber this save (issue #71). */
  cid: string
  /** Resolved handle, for the navbar breadcrumb (overview tab). */
  handle: string | null
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/** True when the existing description is present but in a shape the
 *  leaflet editor can't open in-place — a `com.atproto.repo.strongRef`
 *  union member, a `org.hypercerts.defs#descriptionString`, or any
 *  unrecognised variant. Without preserve-mode, saving from the
 *  editor would silently overwrite the original with an empty leaflet
 *  doc (issue #67 review B3 / round-2 #5).
 *
 *  Plain strings and linearDocuments are NOT preserved here — the
 *  editor handles both natively (string is wrapped to a 1-block
 *  linearDocument on enter, linearDocument round-trips). The
 *  predicate uses the parsed `linear` result to decide: if we
 *  produced a non-null linearDocument, the value is editable; if not
 *  (and there's still something there), preserve. */
function shouldPreserveDescription(
  value: unknown,
  linear: unknown,
): boolean {
  if (value == null) return false
  if (typeof value === "string") return false
  if (linear != null) return false
  return true
}

function contributorKey(
  c: ActivityContributorType,
  index: number,
): string {
  const id = c.contributorIdentity as unknown
  if (id && typeof id === "object") {
    const obj = id as Record<string, unknown>
    if (typeof obj.uri === "string") return `${obj.uri}#${index}`
    if (typeof obj.identity === "string") return `${obj.identity}#${index}`
  }
  if (typeof id === "string") return `${id}#${index}`
  return `contributor-${index}`
}

function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

/**
 * Detail view for a single `org.hypercerts.collection` project record.
 *
 * Layout reads top-down like a GitHub repo README or a Behance project
 * page: a wide hero banner, then the project's own title and
 * description take the full reading column. Contributors and dates
 * live in a small meta strip beneath the description. The certs that
 * belong to this project render last as full `<ActivityCard>`s via
 * `<FeedLayout>` so they match every other surface that renders certs.
 *
 * The root carries `project-detail--wide`; `project-detail.css` uses a
 * `:has()` rule to widen `.app-shell__content` only on this page
 * (mirroring the cert detail page's opt-in widening).
 *
 * Inline edit: when the viewer can edit (own DID === project DID, or
 * acting-as-group with owner/admin role on the group that owns the
 * project), an Edit button appears in the title row. Click swaps the
 * title / shortDescription / description / hero image into editable
 * surfaces and mounts the sticky `<EditBanner>` above the article.
 * Save calls `putProjectRecord` which routes through the BFF route
 * `/api/groups/<did>/project` for group writes (server-pins
 * `createdAt`, `type`, `items`) or straight XRPC for own-DID writes.
 */
export default function ProjectDetail({
  did,
  rkey,
  value,
  cid,
  handle,
}: ProjectDetailProps) {
  // Edit-eligibility mirrors `activity-detail.tsx:165-184`.
  const { did: sessionDid, isAuthenticated } = useAuth()
  const { activeOrg, groups, switchOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  // When acting as a group, only group-owned projects are editable;
  // the personal-edit branch only fires when no org is active.
  // Otherwise a member who switched into a group would still see
  // the Edit button on their own personal projects.
  const isOwner = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  const editTargetDid = canEditAsActiveOrg ? did : undefined
  // Group-edit affordance — the viewer is NOT a direct owner (own project
  // or active-org owner/admin), but they ARE an owner/admin of the group
  // that owns this project while signed in under a different identity.
  // Offer an Edit button that, on confirm, switches them into the owning
  // group before opening the editor (mirrors activity-detail.tsx).
  const editAsGroup = isOwner
    ? null
    : groups.find(
        (g) =>
          g.groupDid === did &&
          (g.role === "owner" || g.role === "admin"),
      ) ?? null
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const editHref = `${recordUrl(did, "project", rkey ?? "")}/edit`

  // -------------------------------------------------------------------
  // Inline edit state — same pattern as cert detail. Drafts seeded
  // from `value` on enter; on save we PUT the record and update local
  // mirrors so the read-only view reflects the change immediately.
  // -------------------------------------------------------------------
  const [isEditing, setIsEditing] = useState(false)
  const [drafts, setDrafts] = useState({
    title: "",
    shortDescription: "",
    description: null as LinearDocument | null,
  })
  // `null` here means "preserve" — when the existing description is
  // a strongRef we show a banner and don't render the editor unless
  // the user clicks "edit anyway" (review B3).
  const [preserveDescription, setPreserveDescription] = useState(false)
  const [localValue, setLocalValue] = useState<CollectionValue | null>(null)
  const [pendingImageBlob, setPendingImageBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] =
    useState<string | null>(null)
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null)
  // `true` when the user clicked Remove on the hero image overlay.
  // The save handler then deletes `banner` / `image` from the record.
  const [imageRemoved, setImageRemoved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Snapshot of the record value + CID at edit-start (the
   *  CID-precondition baseline for swapRecord). Captured on
   *  `handleEditClick`; consumed by the swap-aware save handler
   *  to detect concurrent edits and decide rebase vs banner
   *  (issue #71). */
  const [mountSnapshot, setMountSnapshot] = useState<{
    value: CollectionValue
    cid: string
  } | null>(null)

  /** Editable mirror of `items[]`. Initialized from the stored
   *  record on Edit-click and used as the source of truth for the
   *  cert grid while in edit mode (so add/remove reflects live).
   *  The shape matches the lexicon: `{ itemIdentifier: { uri, cid } }`
   *  with arbitrary extra fields preserved verbatim (`itemWeight`
   *  etc., though the inline-edit UI doesn't touch those). */
  const [draftItems, setDraftItems] = useState<Record<string, unknown>[]>([])
  /** Toggles the inline CertSearch picker between "Add cert" button
   *  and the live search field. One picker open at a time. */
  const [addingCert, setAddingCert] = useState(false)
  /** Which card's ⋯ menu is currently open. `null` means none.
   *  Only one open at a time — opening another auto-closes the
   *  previous. */
  const [openMenuUri, setOpenMenuUri] = useState<string | null>(null)

  const effectiveValue = localValue ?? value
  const editing = isEditing && isOwner

  // Refs for the M5 focus-management fix — focus the title input on
  // enter, return focus to the Edit button on cancel/save.
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const editBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (editing) titleInputRef.current?.focus()
  }, [editing])

  // The per-card ⋯ menu is a <Popover> (controlled via `openMenuUri`);
  // the primitive owns click-outside + Esc-to-close + focus return, so
  // no hand-rolled document listeners are needed here.

  const title =
    asString(effectiveValue.title) ||
    asString(effectiveValue.name) ||
    "Untitled project"

  const shortDesc = asString(effectiveValue.shortDescription)
  const showFullDescription = isRenderableDescription(effectiveValue.description)

  // Subtab routing — the top bar renders the strip (Overview /
  // Description / Certs) and writes `?tab=` on click. We read it
  // here and pick the right slice of content below. Matches the
  // cert detail's pattern.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  // Legacy ?tab=certs resolves to activities so old links keep working.
  const normalizedTab = tabParam === "certs" ? "activities" : tabParam
  const activeTab: "overview" | "description" | "activities" | "updates" =
    normalizedTab === "description" ||
    normalizedTab === "activities" ||
    normalizedTab === "updates"
      ? normalizedTab
      : "overview"

  // Updates count for the navbar title on the Updates tab. Fetched only
  // on that tab (null subjectUri = no fetch elsewhere).
  const { updates: navUpdates } = useContextUpdates(
    activeTab === "updates"
      ? `at://${did}/org.hypercerts.collection/${rkey}`
      : null,
  )

  // Navbar title: sub-tabs show the tab name next to the back arrow; the
  // overview shows the project's own name. (We deliberately don't prefix
  // it with the author handle — the mobile bar is too narrow to show both,
  // and the name is the useful identifier.)
  usePageTitle(
    activeTab === "description"
      ? "Description"
      : activeTab === "updates"
        ? navUpdates.length > 0
          ? `Updates (${navUpdates.length})`
          : "Updates"
        : activeTab === "activities"
          ? Array.isArray(value.items) && value.items.length > 0
            ? `Activities (${value.items.length})`
            : "Activities"
          : title || "Project",
  )
  // Record-level overflow menu in the mobile navbar's right slot (Share /
  // Add to list / Copy AT URI). Reads as page-level chrome instead of an
  // action on the author. Desktop keeps the in-body menu (lead row).
  usePageRecordMenu(
    rkey
      ? {
          targetUri: `at://${did}/org.hypercerts.collection/${rkey}`,
          targetCid: cid,
          targetType: LIST_PROJECTS_TYPE,
          shareTab: activeTab === "overview" ? null : activeTab,
        }
      : null,
  )

  /** Build a URL pointing at another subtab on this page —
   *  preserves any other query params the user might be carrying
   *  (rare today; future-proof). Returns null when pathname isn't
   *  resolved yet so callers can skip rendering the link. */
  const buildTabHref = useCallback(
    (tab: "overview" | "description" | "activities" | "updates"): string | null => {
      if (!pathname) return null
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (tab === "overview") params.delete("tab")
      else params.set("tab", tab)
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams],
  )

  const descriptionHref = buildTabHref("description")
  const certsHref = buildTabHref("activities")
  const updatesHref = buildTabHref("updates")

  // Image resolution order:
  //   1. In-flight preview (object URL — atproto PDSes don't serve a
  //      blob via getBlob until the record references it, so we
  //      bridge with the local file).
  //   2. Post-save local mirror.
  //   3. Re-resolved from the local mirror's record.
  //   4. Original server value.
  const rawImage =
    (effectiveValue as Record<string, unknown>).banner ??
    (effectiveValue as Record<string, unknown>).image
  const serverImageUrl =
    rawImage && !imageRemoved
      ? resolveActivityImageUrl(
          rawImage as Parameters<typeof resolveActivityImageUrl>[0],
          did,
        )
      : null
  const effectiveImageUrl =
    pendingImagePreviewUrl ?? localImageUrl ?? serverImageUrl

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [effectiveImageUrl])

  const createdAt = asString(effectiveValue.createdAt)
  // `startDate` / `endDate` (below) and `contributors` (further down) are
  // activity-only meta: the project create / edit forms never write them, so
  // for records authored in-app these reads are always null/empty. They are
  // kept — and rendered when present — to tolerate legacy records and foreign
  // `app.certified.activity`-shaped records that do carry this meta, rather
  // than silently dropping data this view can faithfully display.
  const startDate = asString(
    (effectiveValue as Record<string, unknown>).startDate as unknown,
  )
  const endDate = asString(
    (effectiveValue as Record<string, unknown>).endDate as unknown,
  )
  // `location` persists as a `com.atproto.repo.strongRef` ({ uri, cid })
  // pointing at an `app.certified.location` record (see create / edit
  // pages). `asString` returns null for that object, so the legacy
  // string path stays inline; the strongRef is handed straight to
  // CertLocationsMap, which resolves and renders the coordinates.
  const rawLocation = (effectiveValue as Record<string, unknown>).location
  const inlineLocation = asString(rawLocation)
  const locationRef =
    rawLocation && typeof rawLocation === "object"
      ? (rawLocation as { uri?: unknown; cid?: unknown })
      : null
  const locationRefUri =
    typeof locationRef?.uri === "string" ? locationRef.uri : null
  const locationCid =
    typeof locationRef?.cid === "string" ? locationRef.cid : ""
  // A resolvable location record renders the SAME interactive map the
  // activity detail page uses — CertLocationsMap takes the strongRef and
  // resolves the coordinates itself. Legacy inline-string locations have
  // no record to map, so they fall back to a plain text value.
  const locationStrongRefs = locationRefUri
    ? [{ uri: locationRefUri, cid: locationCid }]
    : []

  const contributors = Array.isArray(
    (effectiveValue as Record<string, unknown>).contributors,
  )
    ? ((effectiveValue as Record<string, unknown>).contributors as ActivityContributorType[])
    : []

  // While editing, the cert grid renders from `draftItems` so
  // add/remove are immediately reflected. Outside edit mode it
  // tracks the stored value. `useProjectItems` keys off the URI list
  // so this swap triggers a refetch only when the user actually
  // mutates the draft (the initial draft copies value.items verbatim
  // → same key → no extra round-trip on Edit-click).
  const itemsForResolve = isEditing ? draftItems : effectiveValue.items
  const { resolutions, isLoading: itemsLoading } = useProjectItems(
    itemsForResolve,
  )

  const resolvedActivities = useMemo<ActivityRecord[]>(
    () =>
      resolutions
        .map((r) => r.record)
        .filter((r): r is ActivityRecord => r != null),
    [resolutions],
  )
  const didByUri = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>()
    for (const r of resolutions) {
      if (r.record && r.did) m.set(r.record.uri, r.did)
    }
    return m
  }, [resolutions])

  // Time period rendering — same rules as the cert detail.
  let timePeriodLabel: string | null = null
  if (startDate && endDate) {
    timePeriodLabel = `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
  } else if (startDate) {
    timePeriodLabel = `${formatShortDate(startDate)} (ongoing)`
  } else if (endDate) {
    timePeriodLabel = `Until ${formatShortDate(endDate)}`
  }

  const certCount = resolutions.length
  // Phones show the activities preview as full-width list rows (the
  // explore list view); desktop keeps the card grid.
  const { isDesktop } = useLayoutBreakpoints()
  // Date created lives ABOVE the meta aside now (rendered inline
  // below the head bar, no card chrome) so it isn't part of the
  // aside's empty-state check.
  const hasAnyMeta = !!timePeriodLabel || contributors.length > 0
  const hasLocation = !!locationRefUri || !!inlineLocation

  const handleEditClick = useCallback(() => {
    const linear =
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
        : null)
    setDrafts({
      title: asString(effectiveValue.title) || "",
      shortDescription: asString(effectiveValue.shortDescription) || "",
      description: linear,
    })
    setPreserveDescription(
      shouldPreserveDescription(effectiveValue.description, linear),
    )
    // Seed draft items from the stored record. Keep extra fields
    // (itemWeight, addedAt, …) by spreading each entry.
    setDraftItems(
      Array.isArray((effectiveValue as Record<string, unknown>).items)
        ? (
            (effectiveValue as Record<string, unknown>).items as Record<
              string,
              unknown
            >[]
          ).map((it) => ({ ...it }))
        : [],
    )
    setAddingCert(false)
    setOpenMenuUri(null)
    // Capture the value + CID at edit-start as the swapRecord
    // baseline. Save handler compares fresh server reads against
    // this to detect same-field conflicts.
    setMountSnapshot({ value: effectiveValue, cid })
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageRemoved(false)
    setSaveError(null)
    setIsEditing(true)
  }, [effectiveValue, cid])

  // ----- Destructive delete -----
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const useGroupRoute = canEditAsActiveOrg
      const res = await authFetch(
        useGroupRoute
          ? `/api/groups/${encodeURIComponent(did)}/project`
          : "/api/xrpc/com/atproto/repo/deleteRecord",
        {
          method: useGroupRoute ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useGroupRoute
              ? { rkey }
              : {
                  repo: did,
                  collection: "org.hypercerts.collection",
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
      // Hard navigation (window.location) instead of router.push
      // so client-side caches on the destination page (profile
      // projects + certs lists, module-level memoised fetches)
      // don't leave the just-deleted project sitting in the grid.
      if (typeof window !== "undefined") {
        window.location.href = profileUrl(did)
      } else {
        router.push(profileUrl(did))
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed")
      setIsDeleting(false)
    }
  }, [rkey, did, canEditAsActiveOrg, router])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageRemoved(false)
    setPreserveDescription(false)
    setAddingCert(false)
    setOpenMenuUri(null)
    // draftItems intentionally NOT reset here — it'll be rebuilt
    // from value.items on the next handleEditClick. Keeping it
    // around briefly avoids a render flash if the user reopens
    // the editor immediately.
    setSaveError(null)
    editBtnRef.current?.focus()
  }, [])

  /** Append a cert to the draft items list. Called by CertSearch's
   *  onSelect. The `excludeUris` prop already filters out
   *  already-added URIs from the search results, so the dedup
   *  guard here is belt-and-suspenders. */
  const handleAddCert = useCallback((result: CertSearchResult) => {
    const item = {
      itemIdentifier: {
        uri: result.record.uri,
        cid: result.record.cid,
      },
    }
    setDraftItems((prev) => {
      const uri = result.record.uri
      if (
        prev.some(
          (p) =>
            (p.itemIdentifier as { uri?: string } | undefined)?.uri === uri,
        )
      ) {
        return prev
      }
      return [...prev, item]
    })
    setAddingCert(false)
  }, [])

  /** Drop a cert from the draft items list. The per-card menu auto-
   *  closes after the click. Save is required to persist. */
  const handleRemoveCert = useCallback((uri: string) => {
    setDraftItems((prev) =>
      prev.filter(
        (p) =>
          (p.itemIdentifier as { uri?: string } | undefined)?.uri !== uri,
      ),
    )
    setOpenMenuUri(null)
  }, [])

  /** URIs already in the draft — passed to CertSearch so the picker
   *  hides them from results. Memoized off the stable URI string
   *  so the search component's effect doesn't re-fire on
   *  unrelated state changes. */
  const draftItemUris = useMemo(
    () =>
      draftItems
        .map(
          (it) =>
            (it.itemIdentifier as { uri?: string } | undefined)?.uri ?? null,
        )
        .filter((u): u is string => !!u),
    [draftItems],
  )

  const handleImageFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setImageRemoved(false)
      try {
        const blob = await uploadBlob(
          file,
          editTargetDid ? { targetDid: editTargetDid } : undefined,
        )
        setPendingImageBlob(blob)
      } catch (err) {
        // Surface the failure and clear the dangling optimistic preview
        // so the edit can't be saved with an image that never uploaded.
        setSaveError(
          err instanceof Error ? err.message : "Image upload failed",
        )
        setPendingImageBlob(null)
        setPendingImagePreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      }
    },
    [editTargetDid],
  )

  const handleImageRemove = useCallback(() => {
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageRemoved(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!sessionDid || !isAuthenticated) {
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
        drafts.title.trim() || asString(effectiveValue.title) || ""
      const trimmedShort =
        drafts.shortDescription.trim() ||
        asString(effectiveValue.shortDescription) ||
        ""

      // saveWithSwap operates on a small "user-facing" shape used
      // for dirty-set detection (title / shortDescription /
      // description / items). The write callback expands this to
      // the full record by merging into a captured baseline of
      // ALL fields the user didn't touch via this form.
      type UserShape = {
        title: string
        shortDescription: string
        description: typeof drafts.description
        items: unknown[]
      }
      const userDraftsShape: UserShape = {
        title: trimmedTitle,
        shortDescription: trimmedShort,
        description: drafts.description,
        items: draftItems,
      }
      const userSnapshotShape: UserShape = {
        title: asString(mountSnapshot.value.title) || "",
        shortDescription:
          asString(mountSnapshot.value.shortDescription) || "",
        description: (mountSnapshot.value.description ?? null) as UserShape["description"],
        items: Array.isArray(
          (mountSnapshot.value as Record<string, unknown>).items,
        )
          ? ((mountSnapshot.value as Record<string, unknown>).items as unknown[])
          : [],
      }

      let nextSaved: CollectionValue | null = null
      const result = await saveWithSwap<UserShape, UserShape>({
        mountSnapshot: userSnapshotShape,
        initialCid: mountSnapshot.cid,
        drafts: userDraftsShape,
        // On each iteration: drafts (user edits) win on touched
        // fields; serverShape (latest read) provides the baseline
        // for everything else in the user-facing slice.
        computeNext: (serverShape, draftsArg) => ({
          title: draftsArg.title,
          shortDescription: draftsArg.shortDescription,
          description: draftsArg.description,
          items: draftsArg.items,
          // serverShape unused for these 4 user-touched fields —
          // expansion to the full record below carries forward
          // server-side disjoint fields (location, contributors,
          // dates) via the effectiveValue baseline at write time.
          _server: serverShape,
        } as unknown as UserShape),
        write: async (next, swapRecord) => {
          // Expand user-facing shape back to full CollectionValue
          // by overlaying onto the most-recently-known full record.
          // Description / image flags handled here (they don't
          // round-trip through the user shape because they have
          // null-vs-strongRef edge cases).
          const built: Record<string, unknown> = {
            ...(effectiveValue as Record<string, unknown>),
            title: next.title,
            shortDescription: next.shortDescription,
            items: next.items,
          }
          if (preserveDescription) {
            // Leave the original strongRef.
          } else if (isEmptyLongDescription(next.description)) {
            delete built.description
          } else if (next.description) {
            built.description = next.description
          }
          if (imageRemoved) {
            delete built.banner
            delete built.image
          } else if (pendingImageBlob) {
            const imageValue: HypercertsLargeImage = {
              $type: "org.hypercerts.defs#largeImage",
              image: pendingImageBlob as unknown as BlobRef,
            }
            built.banner = imageValue
            delete built.image
          }
          await putProjectRecord(
            sessionDid,
            editTargetDid ?? sessionDid,
            rkey,
            built as CollectionValue,
            { swapRecord },
          )
          nextSaved = built as CollectionValue
        },
        read: async () => {
          // Re-read via getRecord (same path useProject uses).
          const params = new URLSearchParams({
            repo: did,
            collection: "org.hypercerts.collection",
            rkey,
          })
          const res = await authFetch(
            `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
          )
          if (!res.ok) throw new Error(`Re-read failed (${res.status})`)
          const data = (await res.json()) as {
            cid: string
            value: CollectionValue
          }
          return {
            cid: data.cid,
            value: {
              title: asString(data.value.title) || "",
              shortDescription:
                asString(data.value.shortDescription) || "",
              description: (data.value.description ??
                null) as UserShape["description"],
              items: Array.isArray(
                (data.value as Record<string, unknown>).items,
              )
                ? ((data.value as Record<string, unknown>).items as unknown[])
                : [],
            },
          }
        },
      })

      if (!result.ok) {
        // Conflict or livelock — persist drafts to localStorage so
        // the user can recover after refresh, and surface a clear
        // error in the EditBanner. Don't throw; the save handler's
        // catch below is for unexpected errors.
        saveDraft(sessionDid, "org.hypercerts.collection", rkey, {
          title: trimmedTitle,
          shortDescription: trimmedShort,
          description: drafts.description,
          items: draftItems,
        })
        if (result.reason === "conflict") {
          setSaveError(
            `Someone else saved while you were editing — conflicts on ${result.conflictingFields.join(", ")}. Your draft is saved locally; refresh to see the latest version and re-apply.`,
          )
        } else {
          setSaveError(
            "Couldn't auto-merge after several retries — your draft is saved locally; refresh to see the latest version.",
          )
        }
        return
      }

      // Success — clear any prior conflict draft.
      try {
        const { clearDraft } = await import("@/lib/utils/swap-drafts")
        clearDraft(sessionDid, "org.hypercerts.collection", rkey)
      } catch {
        // Non-fatal — module load shouldn't fail; if it does,
        // a stale draft just sticks around until next conflict.
      }
      if (nextSaved) setLocalValue(nextSaved)
      if (pendingImagePreviewUrl) {
        // Revoke any prior local mirror before promoting the
        // pending preview, otherwise an edit→save cycle leaks the
        // previous blob URL until tab close. Matches the cert
        // detail save-time pattern (`activity-detail.tsx:317-320`).
        setLocalImageUrl((prev) => {
          if (prev && prev !== pendingImagePreviewUrl) {
            URL.revokeObjectURL(prev)
          }
          return pendingImagePreviewUrl
        })
      }
      if (imageRemoved) {
        setLocalImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      }
      // Don't revoke `pendingImagePreviewUrl` here — it was just
      // promoted to `localImageUrl` above (or is about to be); the
      // unmount cleanup at the bottom of the component handles the
      // final revoke.
      setPendingImagePreviewUrl(null)
      setPendingImageBlob(null)
      setImageRemoved(false)
      setPreserveDescription(false)
      setIsEditing(false)
      editBtnRef.current?.focus()
    } catch (err) {
      if (err instanceof InvalidSwapError) {
        // Should be caught inside saveWithSwap, but defense-in-depth:
        // any uncaught InvalidSwap reaches here and we surface a
        // recoverable error rather than crash.
        setSaveError(
          "Someone else saved while you were editing — please refresh and try again.",
        )
      } else {
        console.error("Failed to save project:", err)
        setSaveError(err instanceof Error ? err.message : "Failed to save project")
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
    draftItems,
    effectiveValue,
    mountSnapshot,
    pendingImageBlob,
    pendingImagePreviewUrl,
    editTargetDid,
    preserveDescription,
    imageRemoved,
  ])

  // Revoke any outstanding object URL on unmount. Without this, a
  // user who navigates away mid-edit (or whose page unmounts after
  // save) leaks the pending preview / local mirror until the tab
  // closes. The setters above already revoke on replacement; this
  // is the unmount-side guarantee. Mirrors the cert detail pattern
  // (`activity-detail.tsx:357-364`) — refs (not deps) so the cleanup
  // only fires on unmount.
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

  return (
    <>
      {/* Editing banner sits ABOVE the article so it spans the full
          content width. Mirrors the cert detail integration. */}
      {editing ? (
        <EditBanner
          label="Editing project"
          error={saveError}
          isSaving={isSaving}
          onCancel={handleCancelEdit}
          onSave={handleSave}
        />
      ) : null}

      <article
        className={`project-detail project-detail--wide project-detail--tab-${activeTab}${editing ? " project-detail--editing" : ""}`}
      >
        {/* Persistent head bar — same shape on every tab:
              Title (left) ── Byline + Edit button (right)
            Title editing lives here too (input replaces h1 while
            editing) so the user can rename from any tab. */}
        <header className="project-detail__head-bar">
          <div className="project-detail__head-title-group">
            <div className="project-detail__eyebrow-row">
              <span className="project-detail__eyebrow" aria-hidden="true">
                Project
              </span>
              {/* Mobile: date created (no label) trails the eyebrow,
                  right-aligned. Hidden on desktop, where it shows in the
                  inline-created row below the hero. */}
              {createdAt ? (
                <time
                  className="project-detail__eyebrow-date"
                  dateTime={createdAt}
                  title={createdAt}
                >
                  {formatShortDate(createdAt)}
                </time>
              ) : null}
            </div>
            {editing ? (
              <input
                ref={titleInputRef}
                type="text"
                className="project-detail__title-input"
                value={drafts.title}
                maxLength={800}
                placeholder="Project title"
                aria-label="Project title"
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, title: e.target.value }))
                }
              />
            ) : (
              <h1 className="project-detail__title" title={title}>
                {title}
              </h1>
            )}
          </div>
          <div className="project-detail__head-actions">
            <span className="project-detail__head-author">
              <ActivityAuthor did={did} />
            </span>
            {!editing && (isOwner || editAsGroup) ? (
              <>
                {isOwner ? (
                  <Link
                    href={editHref}
                    className="project-detail__edit-btn"
                    aria-label="Edit project"
                    title="Edit project"
                  >
                    <Pencil size={14} strokeWidth={1.75} aria-hidden />
                    Edit
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="project-detail__edit-btn"
                    aria-label="Edit project"
                    title={`Edit as ${editAsGroup!.displayName || editAsGroup!.handle}`}
                    onClick={() => setGroupEditOpen(true)}
                  >
                    <Pencil size={14} strokeWidth={1.75} aria-hidden />
                    Edit
                  </button>
                )}
                {isOwner ? (
                  <Tooltip label="Delete project">
                    <button
                      type="button"
                      className="project-detail__delete-btn"
                      aria-label="Delete project"
                      onClick={() => {
                        setDeleteError(null)
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                    </button>
                  </Tooltip>
                ) : null}
              </>
            ) : null}
          </div>
        </header>

        {/* Mobile-only byline: author shown right under the title. (The
            date created sits on the eyebrow row above; the record menu
            now lives in the navbar — usePageRecordMenu.) Desktop keeps
            the author in the head bar and the menu in the lead row, both
            hidden on mobile via CSS. Rendered on every tab. */}
        <div className="project-detail__byline">
          <ActivityAuthor did={did} />
        </div>

        {/* Overview-only: hero banner + short description + the
            "more" link. Hidden on Description / Certs so those tabs
            get the full page width for their content. */}
        {activeTab === "overview" ? (
          <>
            {/* Date created — rendered inline (no card chrome) so
                it reads the same way the cert headline shows it,
                instead of sitting inside the white `.project-
                detail__meta` card. */}
            {createdAt ? (
              <p className="project-detail__inline-created">
                <span className="cert-detail__meta-label">
                  Date created
                </span>
                <time
                  className="project-detail__inline-created-value"
                  dateTime={createdAt}
                  title={createdAt}
                >
                  {formatShortDate(createdAt)}
                </time>
              </p>
            ) : null}
            {/* Hero renders only when there's an image, or in edit mode
                (where the placeholder is the upload target). A project
                without an image shows no placeholder in the read-only
                view — just no hero. */}
            {(effectiveImageUrl && !imageFailed) || editing ? (
              <div
                className={
                  editing
                    ? "project-detail__hero project-detail__hero--editing"
                    : "project-detail__hero"
                }
              >
                {effectiveImageUrl && !imageFailed ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={effectiveImageUrl}
                    alt=""
                    className="project-detail__hero-img"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div
                    className="project-detail__hero-placeholder"
                    aria-hidden="true"
                  >
                    <FolderGit2
                      size={72}
                      strokeWidth={1.25}
                      className="project-detail__hero-placeholder-icon"
                    />
                  </div>
                )}
                {editing ? (
                  <ImageEditOverlay
                    onFile={handleImageFile}
                    hasPending={!!pendingImageBlob}
                    variant="with-remove"
                    onRemove={handleImageRemove}
                    hasImage={!!effectiveImageUrl}
                  />
                ) : null}
              </div>
            ) : null}

            {editing ? (
              <textarea
                className="project-detail__lead-input"
                value={drafts.shortDescription}
                maxLength={3000}
                placeholder="A short description (one or two lines)…"
                aria-label="Short description"
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    shortDescription: e.target.value,
                  }))
                }
                rows={2}
              />
            ) : shortDesc || showFullDescription ? (
              <section className="project-detail__summary">
                {/* Section header in the same style as "Activities in this
                    project" / "Updates": title left, action link right. */}
                <div className="project-detail__certs-header">
                  <h2 className="project-detail__certs-title">Summary</h2>
                  {showFullDescription && descriptionHref ? (
                    <TransitionLink
                      href={descriptionHref}
                      className="project-detail__see-all"
                    >
                      Read full description →
                    </TransitionLink>
                  ) : null}
                </div>
                <div className="project-detail__lead-row">
                  {shortDesc ? (
                    <p className="project-detail__lead">{shortDesc}</p>
                  ) : (
                    <span className="project-detail__lead project-detail__lead--empty" />
                  )}
                  {/* Desktop only — on mobile the menu moves to the byline. */}
                  <span className="project-detail__lead-menu">
                    <AddToListMenu
                      targetUri={`at://${did}/org.hypercerts.collection/${rkey}`}
                      targetCid={cid}
                      targetType={LIST_PROJECTS_TYPE}
                    />
                  </span>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {activeTab === "overview" ? (
          <>
          {hasAnyMeta ? (
            <aside
              className="project-detail__meta"
              aria-label="Project details"
            >
              {timePeriodLabel ? (
                <div className="project-detail__meta-row">
                  <span className="project-detail__meta-label">
                    Time period
                  </span>
                  <span className="project-detail__meta-value">
                    {timePeriodLabel}
                  </span>
                </div>
              ) : null}

              {contributors.length > 0 ? (
                <div className="project-detail__meta-row project-detail__meta-row--wide">
                  <span className="project-detail__meta-label">
                    Contributors
                  </span>
                  <ul className="project-detail__contributors">
                    {contributors.map((c, i) => (
                      <ActivityContributor
                        key={contributorKey(c, i)}
                        contributor={c}
                        role={contributionRoleText(c.contributionDetails)}
                        weight={c.contributionWeight ?? null}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          ) : null}

          {/* Location — same interactive map the activity detail page
              uses. A resolvable location record maps; a legacy inline
              string shows as plain text. */}
          {hasLocation ? (
            <section
              className="project-detail__location-section"
              aria-label="Location"
            >
              <span className="cert-detail__meta-label">
                <MapPin size={11} strokeWidth={2} aria-hidden />
                Location
              </span>
              {locationRefUri ? (
                <CertLocationsMap locations={locationStrongRefs} />
              ) : (
                <span className="project-detail__meta-value">
                  {inlineLocation}
                </span>
              )}
            </section>
          ) : null}
          {/* Certs preview — up to one row (3 cards at widest
              viewport, fewer on narrower). When the project has
              more than the preview cap, a "See all" link points at
              the Certs tab for the full grid. */}
          {certCount > 0 && certsHref ? (
            <section
              className="project-detail__certs project-detail__certs--preview"
              aria-label="Activities preview"
            >
              <div className="project-detail__certs-header">
                <h2 className="project-detail__certs-title">
                  Activities in this project
                </h2>
                <span className="project-detail__certs-count">
                  {certCount}
                </span>
                <TransitionLink
                  href={certsHref}
                  replace
                  className="project-detail__see-all"
                >
                  See all →
                </TransitionLink>
              </div>
              {isDesktop ? (
                <div className="feed">
                  {resolvedActivities
                    .slice(0, OVERVIEW_CERT_PREVIEW)
                    .map((rec) => (
                      <ActivityCard
                        key={rec.uri}
                        record={rec}
                        did={didByUri.get(rec.uri) ?? did}
                      />
                    ))}
                </div>
              ) : (
                <ul className="project-detail__certs-list">
                  {resolvedActivities
                    .slice(0, OVERVIEW_CERT_PREVIEW)
                    .map((rec) => (
                      <li key={rec.uri}>
                        <CertListRow
                          record={rec}
                          did={didByUri.get(rec.uri) ?? did}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </section>
          ) : null}
          <ContextUpdates
            subjectUri={`at://${did}/org.hypercerts.collection/${rkey}`}
            variant="overview"
            maxItems={1}
            seeAllHref={updatesHref}
          />
        </>
        ) : null}

        {activeTab === "description" ? (
          editing ? (
            <div className="project-detail__prose">
              {preserveDescription ? (
                <div className="project-detail__desc-preserve">
                  <p>
                    This project&rsquo;s description is hosted on an external
                    record. Editing here will replace the link with new
                    content.
                  </p>
                  <button
                    type="button"
                    className="project-detail__desc-preserve-cta"
                    onClick={() => {
                      setPreserveDescription(false)
                      setDrafts((d) => ({ ...d, description: null }))
                    }}
                  >
                    Edit anyway
                  </button>
                </div>
              ) : (
                <LeafletEditor
                  value={drafts.description}
                  onChange={(next) =>
                    setDrafts((d) => ({ ...d, description: next }))
                  }
                  placeholder="A long description of this project."
                  ariaLabel="Project description"
                  did={did}
                  onImageUpload={(file) =>
                    uploadBlob(
                      file,
                      editTargetDid ? { targetDid: editTargetDid } : undefined,
                    )
                  }
                />
              )}
            </div>
          ) : showFullDescription ? (
            <div className="project-detail__prose">
              <LeafletDocument
                value={effectiveValue.description}
                did={did}
              />
            </div>
          ) : (
            <p className="project-detail__tab-empty">
              No description has been added yet.
            </p>
          )
        ) : null}

        {activeTab === "activities" ? (
        <section className="project-detail__certs">
          <div className="project-detail__certs-header">
            <h2 className="project-detail__certs-title">Activities in this project</h2>
            <span className="project-detail__certs-count">{certCount}</span>
            {editing && !addingCert ? (
              <button
                type="button"
                className="project-detail__add-cert-btn"
                onClick={() => setAddingCert(true)}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                Add activity
              </button>
            ) : null}
          </div>

          {editing && addingCert ? (
            <div className="project-detail__add-cert-picker">
              <CertSearch
                onSelect={handleAddCert}
                prioritizeAuthorDid={sessionDid ?? undefined}
                excludeUris={draftItemUris}
                placeholder="Search for an activity to add…"
                autoFocus
                clearOnSelect
              />
              <button
                type="button"
                className="project-detail__add-cert-cancel"
                onClick={() => setAddingCert(false)}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {editing ? (
            <div className="feed">
              {itemsLoading && resolvedActivities.length === 0 ? (
                <p className="project-detail__certs-loading">Loading…</p>
              ) : resolvedActivities.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No activities in this project yet"
                  description="Click “Add activity” above to search for and add activities."
                />
              ) : (
                resolvedActivities.map((rec) => (
                  <div
                    key={rec.uri}
                    className="project-detail__cert-cell"
                  >
                    <ActivityCard
                      record={rec}
                      did={didByUri.get(rec.uri) ?? did}
                    />
                    <div className="project-detail__cert-menu">
                      <Popover
                        open={openMenuUri === rec.uri}
                        onOpenChange={(next) =>
                          setOpenMenuUri(next ? rec.uri : null)
                        }
                      >
                        <PopoverTrigger>
                          <button
                            type="button"
                            className="project-detail__cert-menu-btn"
                            aria-label="Activity actions"
                          >
                            <MoreVertical
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end">
                          <PopoverItem
                            className="flex items-center gap-2 whitespace-nowrap"
                            onClick={() => handleRemoveCert(rec.uri)}
                          >
                            <Trash2
                              size={14}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            Remove from project
                          </PopoverItem>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : itemsLoading && resolvedActivities.length === 0 ? (
            <p className="project-detail__certs-loading">Loading…</p>
          ) : resolvedActivities.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No activities in this project yet"
              description="When activities are added to this project, they'll appear here."
            />
          ) : (
            // Gallery view — activity cards in the explore grid.
            <ul className="explore__grid explore__grid--certs">
              {resolvedActivities.map((rec) => (
                <li key={rec.uri}>
                  <ActivityCard
                    record={rec}
                    did={didByUri.get(rec.uri) ?? did}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}

        {activeTab === "updates" ? (
          <ContextUpdates
            subjectUri={`at://${did}/org.hypercerts.collection/${rkey}`}
            variant="full"
            canEdit={isOwner || !!editAsGroup}
            viewerDid={sessionDid}
          />
        ) : null}
      </article>
      {deleteOpen ? (
        <DeleteRecordDialog
          title="Delete this project"
          recordName={asString(effectiveValue.title) || ""}
          recordTypeLabel="project"
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
          message={`This project is published by ${editAsGroup.displayName || editAsGroup.handle}. You'll switch to acting as that group to edit it — your changes are saved as the group, not your personal account.`}
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
    </>
  )
}
