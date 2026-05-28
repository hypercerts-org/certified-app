"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import DeleteRecordDialog from "@/components/ui/delete-record-dialog"
import { authFetch } from "@/lib/auth/fetch"
import {
  Calendar,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
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
import { useRights } from "@/hooks/use-rights"
import { getInitials } from "@/lib/utils/initials"
import { formatShortDate } from "@/lib/utils/format-date"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EditBanner from "@/components/ui/edit-banner"
import { useCertProjects } from "@/hooks/use-cert-projects"
import { useAuthorInfo } from "@/hooks/use-author-info"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
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

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
  /** CID of the record at read time. Threaded into `putRecord` as
   *  `swapRecord` so a concurrent edit in another tab can't silently
   *  clobber this save (issue #71). */
  cid: string
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
}: ActivityDetailProps) {
  const baseImageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null

  const [imageFailed, setImageFailed] = useState(false)
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

  const contributors = value.contributors ?? []
  const contributorCount = contributors.length
  const locations = value.locations ?? []
  const showFullDescription = isRenderableDescription(value.description)

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

  // Tab strip on the top bar (back-row) drives which slice of the
  // record renders in the right pane. Keep the left aside identical
  // across all tabs.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  const activeTab: "overview" | "description" | "contributors" | "updates" =
    tabParam === "description" ||
    tabParam === "contributors" ||
    tabParam === "updates"
      ? tabParam
      : "overview"

  // Edit affordance — the viewer can act on the cert when they're
  // signed in as the cert's creator. Two paths:
  //   - Personal session DID === cert.did (own cert), OR
  //   - Acting-as-group on the group's own cert, AND the role is
  //     owner or admin. Members of a group can switch into it via
  //     the account switcher but the BFF rejects writes from them,
  //     so we hide the affordance rather than land them on a
  //     write-rejected edit page.
  const { did: sessionDid, isAuthenticated } = useAuth()
  const { activeOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
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
  const descriptionHref = pathname
    ? `${pathname}?tab=description`
    : null

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
        window.location.href = `/profile/${encodeURIComponent(did)}`
      } else {
        router.push(`/profile/${encodeURIComponent(did)}`)
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
        setSaveError(err instanceof Error ? err.message : "Failed to save cert")
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
      <div className="cert-detail__title-row">
        {editing ? (
          <input
            type="text"
            className="cert-detail__title-input"
            value={drafts.title}
            maxLength={256}
            placeholder="Cert title"
            aria-label="Cert title"
            onChange={(e) =>
              setDrafts((d) => ({ ...d, title: e.target.value }))
            }
          />
        ) : (
          <h1 className="cert-detail__title">{effectiveValue.title}</h1>
        )}
        {!editing && isCreator ? (
          <>
            <Link
              href={`/activity/${encodeURIComponent(did)}/${encodeURIComponent(rkey ?? "")}/edit`}
              className="cert-detail__edit-btn"
              aria-label="Edit cert"
              title="Edit cert"
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
              Edit
            </Link>
            <button
              type="button"
              className="cert-detail__delete-btn"
              aria-label="Delete cert"
              title="Delete cert"
              onClick={() => {
                setDeleteError(null)
                setDeleteOpen(true)
              }}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      <CertHeadlineColumns
        did={did}
        rkey={rkey}
        createdAt={effectiveValue.createdAt}
        formattedDate={createdAbsolute}
      />
    </header>
  )

  // Overview-only shortDescription section. Lives BELOW the headline
  // (with `cert-detail__main`'s 24px gap) so its top edge aligns
  // with the first content row on the Description / Contributors
  // tabs.
  // Small label that opens the short description on Overview —
  // styled the same as the headline columns above (Date created /
  // Author / Project) so the section reads as another peer in the
  // overview's labelled-meta family.
  const summaryHeading = (
    <span className="cert-detail__meta-label">Summary</span>
  )

  const shortDescSection =
    activeTab !== "overview" ? null : editing ? (
      <section className="cert-detail__section">
        {summaryHeading}
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
      <section className="cert-detail__section">
        {summaryHeading}
        <p className="cert-detail__short-desc">
          {effectiveValue.shortDescription}
        </p>
        {/* `push`-mode link (no `replace`) so the description tab
            becomes a real history entry — pressing the browser
            Back button returns the viewer to the Overview tab.
            The navbar's 2nd-row back button uses its own history
            handler (in `lib/navbar-context`) and walks to whatever
            page the viewer came from before the cert, not to a
            tab within it. */}
        {showFullDescription && descriptionHref ? (
          <Link
            href={descriptionHref}
            scroll={false}
            className="cert-detail__read-more"
          >
            Read full description
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
          </Link>
        ) : null}
      </section>
    ) : showFullDescription && descriptionHref ? (
      <section className="cert-detail__section">
        {summaryHeading}
        <Link
          href={descriptionHref}
          scroll={false}
          className="cert-detail__read-more"
        >
          Read full description
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      </section>
    ) : null

  return (
    <>
      {/* Editing banner sits ABOVE the cert-detail grid so it spans
          the full content width. Placing it inside the article made
          it a grid child of the 2-column layout and squashed it into
          the left rail. */}
      {editing ? (
        <EditBanner
          label="Editing cert"
          error={saveError}
          isSaving={isSaving}
          onCancel={handleCancelEdit}
          onSave={handleSave}
        />
      ) : null}

      <article className="page-layout cert-detail--wide">
      <aside className="cert-detail__aside" aria-label="Cert details">
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

        <dl className="cert-detail__meta">
          {/* "Created" lives in the headline byline now — no need to
              repeat it in the aside meta list. */}
          <div className="cert-detail__meta-row">
            <dt className="cert-detail__meta-label cert-detail__meta-label--with-action">
              <span className="cert-detail__meta-label-text">
                <Calendar size={11} strokeWidth={2} aria-hidden />
                Time period
              </span>
              {rkey ? (
                <AddToListMenu
                  targetUri={`at://${did}/org.hypercerts.claim.activity/${rkey}`}
                  targetCid={cid}
                  targetType={LIST_CERTS_TYPE}
                />
              ) : null}
            </dt>
            <dd className="cert-detail__meta-value">
              {editing ? (
                /* Two date inputs in place of the rendered label.
                   Empty input drops the field on save (#75). */
                <span className="cert-detail__meta-edit">
                  <input
                    type="date"
                    aria-label="Start date"
                    className="cert-detail__meta-input"
                    value={drafts.startDate}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, startDate: e.target.value }))
                    }
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    type="date"
                    aria-label="End date"
                    className="cert-detail__meta-input"
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
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Target size={11} strokeWidth={2} aria-hidden />
                Work scope
              </dt>
              <dd className="cert-detail__meta-value">
                {editing ? (
                  /* Plain text input. Serialised as the
                     `WorkScopeString` lexicon variant on save;
                     complex CEL workscope authoring lives
                     elsewhere (#75 trade-off). */
                  <input
                    type="text"
                    aria-label="Work scope"
                    className="cert-detail__meta-input"
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
          {contributorCount > 0 ? (
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Users size={11} strokeWidth={2} aria-hidden />
                Contributors
                <span className="cert-detail__meta-count">
                  {contributorCount}
                </span>
              </dt>
              <dd className="cert-detail__meta-value">
                {(() => {
                  const ASIDE_CONTRIB_PREVIEW = 5
                  const previewContributors = contributors.slice(
                    0,
                    ASIDE_CONTRIB_PREVIEW,
                  )
                  const hasMore = contributorCount > ASIDE_CONTRIB_PREVIEW
                  const contributorsHref = pathname
                    ? `${pathname}?tab=contributors`
                    : null
                  const hasAnyWeight = previewContributors.some(
                    (c) => c.contributionWeight != null,
                  )
                  // Percentages are computed across the FULL
                  // contributor list (not just the preview slice) so
                  // the % column adds to 100 even when the aside
                  // shows only the first 5 of N rows.
                  const weightPercents = buildWeightPercents(contributors)
                  return (
                    <>
                      {hasAnyWeight ? (
                        <ContributorWeightHeader />
                      ) : null}
                      <ul className="cert-detail__contributors cert-detail__contributors--aside">
                        {previewContributors.map((c, i) => {
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
                      {hasMore && contributorsHref ? (
                        <Link
                          href={contributorsHref}
                          scroll={false}
                          replace
                          className="cert-detail__aside-see-all"
                        >
                          Show all
                        </Link>
                      ) : null}
                    </>
                  )
                })()}
              </dd>
            </div>
          ) : null}

          {/* Rights row — sits at the bottom of the meta list. The
              other meta rows are quick scalar facts; Rights
              references an external record and reads as a
              less-frequent reference. */}
          {value.rights ? (
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <FileText size={11} strokeWidth={2} aria-hidden />
                Rights
              </dt>
              <dd className="cert-detail__meta-value">
                {rightsName ? (
                  rightsName
                ) : rightsLoading ? (
                  <span className="cert-detail__meta-aux">Loading…</span>
                ) : (
                  <span className="cert-detail__uri">{value.rights.uri}</span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </aside>

      <div className="page-layout__main cert-detail__main">
        {headline}

        {activeTab === "overview" ? (
          <>
            {/* Short description + Read-full-description button sit
                ABOVE the Contributors / Projects row so the cert's
                narrative reads first, then the structural facts. The
                Read button is sized to its content (inline-flex on the
                link + align-self:flex-start in CSS so the flex-column
                parent doesn't stretch it to full width). */}
            {shortDescSection}

            {/* Locations + map sit below the summary / read-full
                link so the cert's narrative reads first, then the
                where. Overview-only (the main pane is tab-gated);
                the aside no longer carries a Locations row. */}
            {locations.length > 0 ? (
              <section className="cert-detail__section">
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

            {/* Contributors moved to the aside meta-list — see the
                Contributors row above (`<dt>Contributors</dt>`).
                Project association is now surfaced in the
                three-column byline below the title (see
                `<CertHeadlineColumns>` in the headline above), so
                the older full-width Projects section that used to
                live here is gone — the row would have duplicated
                the headline Project column. */}

            {rkey ? (
              <ContextUpdates
                subjectUri={`at://${did}/org.hypercerts.claim.activity/${rkey}`}
                variant="overview"
                seeAllHref={pathname ? `${pathname}?tab=updates` : null}
              />
            ) : null}
          </>
        ) : activeTab === "description" ? (
          <section className="cert-detail__section">
            {editing ? (
              <LeafletEditor
                value={drafts.description}
                onChange={(next) =>
                  setDrafts((d) => ({ ...d, description: next }))
                }
                placeholder="Full description of this cert."
                ariaLabel="Cert description"
                did={did}
                onImageUpload={(file) =>
                  uploadBlob(
                    file,
                    editTargetDid ? { targetDid: editTargetDid } : undefined,
                  )
                }
              />
            ) : showFullDescription ? (
              <LeafletDocument value={effectiveValue.description} did={did} />
            ) : (
              <p className="cert-detail__short-desc">
                {effectiveValue.shortDescription || "No description yet."}
              </p>
            )}
          </section>
        ) : activeTab === "contributors" ? (
          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Contributors</h2>
              <span className="cert-detail__section-count">
                {contributorCount}
              </span>
            </div>
            {contributorCount > 0 ? (
              (() => {
                const weightPercents = buildWeightPercents(contributors)
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
                          weightPercents.get(i) ??
                          c.contributionWeight ??
                          null
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
        ) : activeTab === "updates" ? (
          rkey ? (
            <ContextUpdates
              subjectUri={`at://${did}/org.hypercerts.claim.activity/${rkey}`}
              variant="full"
            />
          ) : null
        ) : null}
      </div>
    </article>
    {deleteOpen ? (
      <DeleteRecordDialog
        title="Delete this cert"
        recordName={effectiveValue.title || ""}
        recordTypeLabel="cert"
        isDeleting={isDeleting}
        errorMessage={deleteError}
        onCancel={() => {
          if (!isDeleting) setDeleteOpen(false)
        }}
        onConfirm={handleDeleteConfirm}
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

function ContributorRow({ contributor, role, weight }: ContributorRowProps) {
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
    ? `/profile/${encodeURIComponent(info.handle || info.did)}`
    : null
  const initials = getInitials(
    info?.displayName || contribInfo?.displayName || null,
    info?.did || null,
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
}: {
  did: string
  rkey: string | null
  createdAt: string
  formattedDate: string
}) {
  const { info, isLoading: authorLoading } = useAuthorInfo(did)
  const { projects } = useCertProjects(did, rkey)

  return (
    <div className="cert-detail__headline-cols">
      <div className="cert-detail__headline-col">
        <span className="cert-detail__meta-label">Author</span>
        {authorLoading || !info ? (
          <span
            className="cert-detail__headline-col-value cert-detail__headline-col-value--skel"
            aria-hidden="true"
          />
        ) : (
          (() => {
            const displayName = info.displayName || info.handle || "Anonymous"
            const initials = getInitials(info.displayName, did)
            const profileHref = `/profile/${encodeURIComponent(info.handle || did)}`
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

      <div className="cert-detail__headline-col">
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
              ? `/project/${encodeURIComponent(firstParts[1])}/${encodeURIComponent(firstParts[2])}`
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

