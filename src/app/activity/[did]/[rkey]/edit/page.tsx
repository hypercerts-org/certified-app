"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Calendar,
  FileText,
  MapPin,
  PenLine,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import EditBanner from "@/components/ui/edit-banner"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import LoadingSpinner from "@/components/ui/loading-spinner"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import { uploadBlob, type UploadedBlob } from "@/lib/atproto/profile"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useActivity } from "@/hooks/use-activity"
import {
  ContributorIdentityField,
  isContributorIdentityAcceptable,
  isContributorWeightAcceptable,
  normalizeIdentity,
} from "@/components/create/contributor-identity-field"
import { ContributorIdentityCard } from "@/components/create/contributor-identity-card"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"
import LocationPickerDialog, {
  type AddedLocation,
} from "@/components/create/location-picker-dialog"
import type {
  ClaimActivity,
  StrongRef,
  ActivityContributor,
} from "@/lib/atproto/activity-types"
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import {
  evaluateWorkScope,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { asLinearDocument, isEmptyLongDescription } from "@/lib/leaflet/guards"
import { putCertRecord } from "@/lib/atproto/cert"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { saveWithSwap } from "@/lib/atproto/save-with-swap"
import { splitLocationName } from "@/lib/atproto/location"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * `/activity/[did]/[rkey]/edit` — full-page cert editor. Same visual
 * shell as `/create` (single-page form, no tabs), pre-filled from the
 * cert's existing record. Save routes through `putCertRecord` with a
 * `swapRecord` CID precondition so a concurrent edit elsewhere can't
 * silently clobber this write.
 *
 * Auth gate: signed-in + (own cert OR acting as the group that owns
 * the cert with owner/admin role). Mirrors the inline-edit gate on
 * the read-mode page.
 *
 * Contributors with a strong-ref identity variant (not the inline
 * `#contributorIdentity` shape that the /create form emits) are
 * passed through unchanged at save time — the editor doesn't surface
 * them as rows but it does preserve them via the `...effectiveValue`
 * overlay in the save handler.
 */

const RIGHTS_PUBLISHER_DID = "did:plc:s4puetfspot742ai7y4otuel"
const RIGHTS_COLLECTION = "org.hypercerts.claim.rights"

interface ContributorRow {
  key: string
  identity: string
  weight: string
  role: string
  /** True once the identity is "committed" — pre-filled from the
   *  loaded record, picked from the typeahead, or accepted via
   *  Enter / blur. Drives the card-vs-input swap. New rows start
   *  uncommitted so the typing flow doesn't prematurely lock in
   *  intermediate matches (e.g. `alice.so` → `alice.social`). */
  picked: boolean
}

function freshContributor(): ContributorRow {
  return {
    key: `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identity: "",
    weight: "",
    role: "",
    picked: false,
  }
}

interface RightsOption {
  ref: StrongRef
  name: string
}

/** Convert the lexicon contributor union to the row shape this form
 *  edits. Strong-ref contributor identities can't be edited inline
 *  (they're records, not strings) and are dropped from the row list —
 *  the save handler reattaches them through the `...effectiveValue`
 *  overlay so they survive a round-trip. */
function contributorRowFromRecord(
  c: ActivityContributor,
  idx: number,
): ContributorRow | null {
  const id = c.contributorIdentity
  if (!id || typeof id !== "object") return null
  if (!("identity" in id) || typeof id.identity !== "string") return null
  const weightRaw = c.contributionWeight
  const weight = typeof weightRaw === "string" ? weightRaw : ""
  let role = ""
  const details = c.contributionDetails
  if (details && typeof details === "object" && "role" in details) {
    role = typeof (details as { role?: unknown }).role === "string"
      ? (details as { role: string }).role
      : ""
  } else if (typeof details === "string") {
    role = details
  }
  return {
    key: `seed-${idx}-${id.identity}`,
    identity: id.identity,
    weight,
    role,
    // Pre-filled rows are committed by definition — they came from a
    // saved record, so the card renders immediately on page load.
    picked: true,
  }
}

/** Return contributors that AREN'T representable as rows (strongRef
 *  identities). Carried forward unchanged through save. */
function carriedForwardContributors(
  contributors: ActivityContributor[] | undefined,
): ActivityContributor[] {
  if (!contributors) return []
  return contributors.filter((c) => {
    const id = c.contributorIdentity
    if (!id || typeof id !== "object") return true
    return !("identity" in id) || typeof id.identity !== "string"
  })
}

interface ResolvedLocationRow {
  ref: StrongRef
  name: string
}

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = AT_URI_RE.exec(uri)
  if (!m) return null
  return { did: m[1], collection: m[2], rkey: m[3] }
}

export default function ActivityEditPage() {
  usePageTitle("Edit cert")
  const router = useRouter()
  const params = useParams()
  const did = useMemo(() => {
    const raw = params.did
    return typeof raw === "string" ? decodeURIComponent(raw) : null
  }, [params.did])
  const rkey = useMemo(() => {
    const raw = params.rkey
    return typeof raw === "string" ? decodeURIComponent(raw) : null
  }, [params.rkey])

  const { isAuthenticated, isLoading: authLoading, did: sessionDid } = useAuth()
  const { activeOrg } = useOrg()

  // The edit endpoint to call: own repo via XRPC proxy when the
  // viewer's session DID matches the cert's owner; the group BFF
  // when the cert is owned by the active org and the role permits.
  const canEditAsActiveOrg =
    !!activeOrg && !!did && activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  const isCreator = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  const editTargetDid = canEditAsActiveOrg ? did : undefined

  const { activity, isLoading: activityLoading, error: activityError } =
    useActivity(did, rkey)

  // -------------------------------------------------------------------
  // Form state — same shape as /create. All fields are seeded from the
  // existing record once `activity` resolves (see seed effect below).
  // -------------------------------------------------------------------
  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [workScope, setWorkScope] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [contributors, setContributors] = useState<ContributorRow[]>([])

  // Image: existing record's image still renders by default; only on
  // replace do we stage a new blob.
  const [pendingImageBlob, setPendingImageBlob] = useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)

  const [locations, setLocations] = useState<ResolvedLocationRow[]>([])
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)

  const [rightsOptions, setRightsOptions] = useState<RightsOption[]>([])
  const [rightsLoading, setRightsLoading] = useState(true)
  const [rightsLoadError, setRightsLoadError] = useState<string | null>(null)
  const [rightsUri, setRightsUri] = useState<string>("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Snapshot captured at seed time — the swap-record baseline. The
   *  save handler diffs against this to detect concurrent edits. */
  const [mountSnapshot, setMountSnapshot] = useState<{
    value: ClaimActivity
    cid: string
  } | null>(null)
  const seededRef = useRef(false)

  // "Add me" needs the publishing identity's @handle/DID. Same logic
  // as /create — group DID when acting as a group, otherwise own DID.
  const effectivePublisherDid: string =
    activeOrg?.groupDid ?? sessionDid ?? ""
  const { info: selfInfo } = useAuthorInfo(effectivePublisherDid)

  // -------------------------------------------------------------------
  // Rights options — same listRecords call /create uses.
  // -------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController()
    setRightsLoading(true)
    setRightsLoadError(null)
    const qs = new URLSearchParams({
      repo: RIGHTS_PUBLISHER_DID,
      collection: RIGHTS_COLLECTION,
      limit: "100",
    })
    authFetch(`/api/xrpc/com/atproto/repo/listRecords?${qs.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`listRecords failed: ${res.status}`)
        const body = (await res.json()) as {
          records?: Array<{
            uri: string
            cid: string
            value?: { rightsName?: unknown }
          }>
        }
        const opts: RightsOption[] = (body.records ?? []).map((rec) => {
          const rawName =
            typeof rec.value?.rightsName === "string"
              ? rec.value.rightsName.trim()
              : ""
          const fallback = rec.uri.split("/").pop() ?? "(unnamed rights)"
          return {
            ref: { uri: rec.uri, cid: rec.cid },
            name: rawName || fallback,
          }
        })
        opts.sort((a, b) => a.name.localeCompare(b.name))
        setRightsOptions(opts)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setRightsLoadError(
          err instanceof Error ? err.message : "Failed to load rights",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setRightsLoading(false)
      })
    return () => controller.abort()
  }, [])

  // -------------------------------------------------------------------
  // Seed form fields from the loaded activity. Runs exactly once per
  // mount — `seededRef` keeps a manual revert (user types, then we
  // re-render because of another state update) from being clobbered
  // by re-running the seeder. The swap baseline is captured here too.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (seededRef.current) return
    if (!activity) return
    const v = activity.value
    setTitle(v.title ?? "")
    setShortDescription(v.shortDescription ?? "")
    setStartDate(
      typeof v.startDate === "string" ? v.startDate.slice(0, 10) : "",
    )
    setEndDate(
      typeof v.endDate === "string" ? v.endDate.slice(0, 10) : "",
    )
    setWorkScope(evaluateWorkScope(v.workScope) ?? "")
    setDescription(
      asLinearDocument(v.description) ??
        (typeof v.description === "string" && v.description.trim().length > 0
          ? {
              $type: "pub.leaflet.pages.linearDocument" as const,
              blocks: [
                {
                  block: {
                    $type: "pub.leaflet.blocks.text" as const,
                    plaintext: v.description,
                  },
                },
              ],
            }
          : null),
    )
    const rows: ContributorRow[] = []
    ;(v.contributors ?? []).forEach((c, idx) => {
      const r = contributorRowFromRecord(c, idx)
      if (r) rows.push(r)
    })
    setContributors(rows)
    setRightsUri(v.rights?.uri ?? "")
    setMountSnapshot({ value: v, cid: activity.cid })
    seededRef.current = true
  }, [activity])

  // -------------------------------------------------------------------
  // Hydrate existing locations into display rows. Names live on the
  // location record itself (one getRecord per strongRef) — we use the
  // same shape `LocationPickerDialog` emits so the row UI is uniform.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!activity) return
    const refs = activity.value.locations ?? []
    if (refs.length === 0) {
      setLocations([])
      return
    }
    let aborted = false
    Promise.all(
      refs.map(async (ref): Promise<ResolvedLocationRow> => {
        const parsed = parseAtUri(ref.uri)
        if (!parsed) return { ref, name: ref.uri }
        const qs = new URLSearchParams({
          repo: parsed.did,
          collection: parsed.collection,
          rkey: parsed.rkey,
        })
        try {
          const res = await authFetch(
            `/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`,
          )
          if (!res.ok) return { ref, name: ref.uri.split("/").pop() ?? ref.uri }
          const data = (await res.json()) as { value?: { name?: string } }
          const raw = data.value?.name?.trim() ?? ""
          const split = splitLocationName(raw)
          const name =
            split.name || raw || ref.uri.split("/").pop() || "Location"
          return { ref, name }
        } catch {
          return { ref, name: ref.uri.split("/").pop() ?? ref.uri }
        }
      }),
    ).then((rows) => {
      if (aborted) return
      setLocations(rows)
    })
    return () => {
      aborted = true
    }
  }, [activity])

  // Revoke object URL on unmount.
  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    }
  }, [pendingImagePreviewUrl])

  // Grapheme counter — same Intl.Segmenter path /create uses.
  const countGraphemes = useCallback((s: string): number => {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
      let count = 0
      for (const _ of seg.segment(s)) count++
      return count
    }
    return Array.from(s).length
  }, [])
  const titleCount = countGraphemes(title)
  const shortDescCount = countGraphemes(shortDescription)
  const TITLE_MIN = 5
  const TITLE_MAX = 256
  const SHORT_DESC_MIN = 100
  const SHORT_DESC_MAX = 300

  // Clear save error whenever any field changes.
  useEffect(() => {
    setError(null)
  }, [
    title,
    shortDescription,
    startDate,
    endDate,
    workScope,
    description,
    contributors,
    pendingImageBlob,
    imageRemoved,
    locations,
    rightsUri,
  ])

  const handleImageFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setImageRemoved(false)
      const targetDid = activeOrg ? activeOrg.groupDid : null
      const blob = await uploadBlob(
        file,
        targetDid ? { targetDid } : undefined,
      )
      setPendingImageBlob(blob)
    },
    [activeOrg],
  )

  const handleImageRemove = useCallback(() => {
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageRemoved(true)
  }, [])

  // Display URL for the image slot: in-flight preview > existing
  // server image (unless removed) > placeholder icon.
  const existingImageUrl =
    !imageRemoved && activity?.value.image && did
      ? resolveActivityImageUrl(activity.value.image, did)
      : null
  const displayImageUrl = pendingImagePreviewUrl ?? existingImageUrl

  // Auth-loading / signed-out states. Mirrors /create's gates.
  if (authLoading || activityLoading) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main create-cert__auth-loading">
            <LoadingSpinner size="md" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={PenLine}
              title="Sign in to edit"
              description="You need to be signed in to edit a cert."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activityError || !activity) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={PenLine}
              title="Cert not found"
              description={activityError || "Couldn't load this cert to edit."}
            />
          </div>
        </div>
      </div>
    )
  }

  if (!isCreator) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={PenLine}
              title="You can't edit this cert"
              description="Only the cert's creator (or the active group it's published under) can make changes."
            />
          </div>
        </div>
      </div>
    )
  }

  // ----- submit -----
  const trimmedTitleCount = countGraphemes(title.trim())
  const trimmedShortDescCount = countGraphemes(shortDescription.trim())
  const titleUnder = trimmedTitleCount > 0 && trimmedTitleCount < TITLE_MIN
  const titleOver = titleCount > TITLE_MAX
  const shortDescUnder =
    trimmedShortDescCount > 0 && trimmedShortDescCount < SHORT_DESC_MIN
  const shortDescOver = shortDescCount > SHORT_DESC_MAX

  const allContributorsValid = contributors.every(
    (c) =>
      isContributorIdentityAcceptable(c.identity) &&
      isContributorWeightAcceptable(c.weight),
  )
  const duplicateIdentitySet = (() => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const c of contributors) {
      const norm = normalizeIdentity(c.identity).toLowerCase()
      if (!norm) continue
      if (seen.has(norm)) dupes.add(norm)
      seen.add(norm)
    }
    return dupes
  })()
  const noContributorDuplicates = duplicateIdentitySet.size === 0
  const datesValid = !startDate || !endDate || startDate <= endDate

  const canSubmit =
    !!sessionDid &&
    !!did &&
    !!rkey &&
    !!mountSnapshot &&
    trimmedTitleCount >= TITLE_MIN &&
    titleCount <= TITLE_MAX &&
    trimmedShortDescCount >= SHORT_DESC_MIN &&
    shortDescCount <= SHORT_DESC_MAX &&
    allContributorsValid &&
    noContributorDuplicates &&
    datesValid &&
    !isSubmitting

  const doSave = async () => {
    if (!canSubmit) return
    if (!sessionDid || !did || !rkey || !mountSnapshot) return

    setIsSubmitting(true)
    setError(null)

    // Build the next record by overlaying form values on the captured
    // snapshot. Strong-ref contributors (and any future field we don't
    // surface in the form) survive via the spread.
    const next: ClaimActivity = { ...mountSnapshot.value }

    next.title = title.trim()
    next.shortDescription = shortDescription.trim()

    if (description && !isEmptyLongDescription(description)) {
      next.description = description
    } else {
      delete (next as { description?: unknown }).description
    }

    if (startDate) {
      next.startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString()
    } else {
      delete (next as { startDate?: unknown }).startDate
    }
    if (endDate) {
      next.endDate = new Date(`${endDate}T00:00:00.000Z`).toISOString()
    } else {
      delete (next as { endDate?: unknown }).endDate
    }

    if (workScope.trim()) {
      next.workScope = {
        $type: "org.hypercerts.claim.activity#workScopeString",
        scope: workScope.trim(),
      }
    } else {
      delete (next as { workScope?: unknown }).workScope
    }

    // Contributors — rebuild from rows + carry-forward strongRefs.
    const seen = new Set<string>()
    const rowContributors: ActivityContributor[] = []
    for (const c of contributors) {
      const norm = normalizeIdentity(c.identity)
      if (!norm) continue
      const key = norm.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const entry: ActivityContributor = {
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity",
          identity: norm,
        } as ActivityContributor["contributorIdentity"],
      }
      if (c.weight.trim()) entry.contributionWeight = c.weight.trim()
      if (c.role.trim()) {
        entry.contributionDetails = {
          $type: "org.hypercerts.claim.activity#contributorRole",
          role: c.role.trim(),
        } as ActivityContributor["contributionDetails"]
      }
      rowContributors.push(entry)
    }
    const carried = carriedForwardContributors(mountSnapshot.value.contributors)
    const merged = [...rowContributors, ...carried]
    if (merged.length > 0) {
      next.contributors = merged
    } else {
      delete (next as { contributors?: unknown }).contributors
    }

    // Image. Three states: unchanged (no pending blob, not removed),
    // replaced (pending blob), or removed (imageRemoved flag).
    if (pendingImageBlob) {
      const imageValue: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        image: pendingImageBlob as unknown as BlobRef,
      }
      next.image = imageValue
    } else if (imageRemoved) {
      delete (next as { image?: unknown }).image
    }
    // else: leave next.image as the snapshot's existing image.

    if (locations.length > 0) {
      next.locations = locations.map((l) => l.ref)
    } else {
      delete (next as { locations?: unknown }).locations
    }

    if (rightsUri) {
      const chosen = rightsOptions.find((o) => o.ref.uri === rightsUri)
      if (chosen) next.rights = chosen.ref
    } else {
      // Honor the "No rights" pick: drop the field.
      delete (next as { rights?: unknown }).rights
    }

    try {
      // saveWithSwap diffs on a small flat user-shape (matches the
      // pattern activity-detail's inline-edit uses). The full record
      // is rebuilt inside `write` from the captured `mountSnapshot`
      // overlay + the closed-over form state — so the conflict
      // detector compares the scalars the user actually edited while
      // collection-shaped fields (contributors, locations, rights,
      // image) survive unchanged across a silent rebase.
      type UserShape = {
        title: string
        shortDescription: string
        description: LinearDocument | null
        workScope: string
        startDate: string
        endDate: string
        [key: string]: unknown
      }
      const userDrafts: UserShape = {
        title: title.trim(),
        shortDescription: shortDescription.trim(),
        description: description,
        workScope: workScope.trim(),
        startDate,
        endDate,
      }
      const userMountSnapshot: UserShape = {
        title: mountSnapshot.value.title ?? "",
        shortDescription: mountSnapshot.value.shortDescription ?? "",
        description:
          asLinearDocument(mountSnapshot.value.description) ?? null,
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
      const result = await saveWithSwap<UserShape, UserShape>({
        mountSnapshot: userMountSnapshot,
        initialCid: mountSnapshot.cid,
        drafts: userDrafts,
        computeNext: (_serverShape, draftsArg) => draftsArg,
        write: async (_userNext, swapRecord) => {
          await putCertRecord(
            sessionDid,
            editTargetDid ?? sessionDid,
            rkey,
            next,
            { swapRecord },
          )
        },
        read: async () => {
          const qs = new URLSearchParams({
            repo: did,
            collection: "org.hypercerts.claim.activity",
            rkey,
          })
          const res = await fetch(
            `/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`,
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
              description:
                asLinearDocument(data.value.description) ?? null,
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
        if (result.reason === "conflict") {
          setError(
            `Someone else saved while you were editing — conflicts on ${result.conflictingFields.join(", ")}. Refresh to load the latest version.`,
          )
        } else {
          setError(
            "Couldn't auto-merge after several retries — refresh to load the latest version.",
          )
        }
        setIsSubmitting(false)
        return
      }

      router.push(
        `/activity/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
      )
    } catch (err) {
      if (err instanceof InvalidSwapError) {
        setError(
          "Someone else saved while you were editing — please refresh and try again.",
        )
      } else {
        setError(err instanceof Error ? err.message : "Failed to save cert")
      }
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (did && rkey) {
      router.push(
        `/activity/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
      )
    } else {
      router.back()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void doSave()
      }}
    >
      <EditBanner
        label="Editing cert"
        error={error}
        isSaving={isSubmitting}
        canSave={canSubmit}
        onCancel={handleCancel}
        onSave={() => {
          void doSave()
        }}
      />
      <article className="page-layout cert-detail--wide create-cert">
        <aside className="cert-detail__aside" aria-label="Cert metadata">
          <div className="cert-detail__image cert-detail__image--editing">
            {displayImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={displayImageUrl}
                alt=""
                className="cert-detail__image-img"
              />
            ) : (
              <PenLine
                size={32}
                strokeWidth={1.25}
                aria-hidden
                className="cert-detail__image-placeholder-icon"
              />
            )}
            <ImageEditOverlay
              onFile={handleImageFile}
              hasPending={!!pendingImageBlob}
              variant="with-remove"
              onRemove={handleImageRemove}
              hasImage={!!displayImageUrl}
            />
          </div>

          <dl className="cert-detail__meta">
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Calendar size={11} strokeWidth={2} aria-hidden />
                Time period
              </dt>
              <dd className="cert-detail__meta-value">
                <div className="create-cert__date-row">
                  <input
                    type="date"
                    aria-label="Start date"
                    className="cert-detail__meta-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span aria-hidden>→</span>
                  <input
                    type="date"
                    aria-label="End date"
                    className={
                      datesValid
                        ? "cert-detail__meta-input"
                        : "cert-detail__meta-input create-cert__contrib-id-input--invalid"
                    }
                    aria-invalid={!datesValid}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                {!datesValid ? (
                  <p className="create-cert__contrib-error" role="alert">
                    End date must be on or after the start date.
                  </p>
                ) : null}
              </dd>
            </div>

            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Target size={11} strokeWidth={2} aria-hidden />
                Work scope
              </dt>
              <dd className="cert-detail__meta-value">
                <input
                  type="text"
                  aria-label="Work scope"
                  className="cert-detail__meta-input create-cert__field--full"
                  placeholder="e.g. mentorship, code review…"
                  value={workScope}
                  maxLength={256}
                  onChange={(e) => setWorkScope(e.target.value)}
                />
              </dd>
            </div>

            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <MapPin size={11} strokeWidth={2} aria-hidden />
                Locations
                {locations.length > 0 ? (
                  <span className="cert-detail__meta-count">
                    {locations.length}
                  </span>
                ) : null}
              </dt>
              <dd className="cert-detail__meta-value">
                {locations.length > 0 ? (
                  <ul className="create-cert__loc-list">
                    {locations.map((loc) => (
                      <li
                        key={loc.ref.uri}
                        className="create-cert__loc-row"
                      >
                        <span className="create-cert__loc-name">
                          {loc.name}
                        </span>
                        <button
                          type="button"
                          className="create-cert__loc-remove"
                          aria-label={`Remove ${loc.name}`}
                          onClick={() =>
                            setLocations((rows) =>
                              rows.filter((r) => r.ref.uri !== loc.ref.uri),
                            )
                          }
                        >
                          <X size={12} strokeWidth={2} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsLocationDialogOpen(true)}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden />
                  Add location
                </Button>
              </dd>
            </div>

            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <FileText size={11} strokeWidth={2} aria-hidden />
                Rights
              </dt>
              <dd className="cert-detail__meta-value">
                {rightsLoading ? (
                  <span className="cert-detail__meta-aux">Loading…</span>
                ) : rightsLoadError ? (
                  <span className="cert-detail__meta-aux">
                    Failed to load
                  </span>
                ) : rightsOptions.length === 0 ? (
                  <span className="cert-detail__meta-aux">None available</span>
                ) : (
                  <select
                    className="cert-detail__meta-input"
                    aria-label="Rights"
                    value={rightsUri}
                    onChange={(e) => setRightsUri(e.target.value)}
                  >
                    <option value="">No rights</option>
                    {rightsOptions.map((opt) => (
                      <option key={opt.ref.uri} value={opt.ref.uri}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                )}
              </dd>
            </div>
          </dl>
        </aside>

        <div className="page-layout__main cert-detail__main">
          <header className="cert-detail__headline">
            <div className="create-cert__input-with-counter">
              <input
                type="text"
                className="cert-detail__title-input"
                aria-label="Title"
                placeholder="Title for your cert"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              <p
                className={`create-cert__counter${
                  titleOver
                    ? " create-cert__counter--over"
                    : titleUnder
                      ? " create-cert__counter--under"
                      : ""
                }`}
                aria-live="polite"
              >
                {titleCount}/{TITLE_MAX} · min. {TITLE_MIN} characters
              </p>
            </div>
          </header>

          <section className="cert-detail__section">
            <div className="create-cert__input-with-counter">
              <textarea
                className="cert-detail__short-desc-input"
                value={shortDescription}
                placeholder="A short description (one or two lines)…"
                aria-label="Short description"
                onChange={(e) => setShortDescription(e.target.value)}
                rows={3}
              />
              <p
                className={`create-cert__counter${
                  shortDescOver
                    ? " create-cert__counter--over"
                    : shortDescUnder
                      ? " create-cert__counter--under"
                      : ""
                }`}
                aria-live="polite"
              >
                {shortDescCount}/{SHORT_DESC_MAX} · min. {SHORT_DESC_MIN}{" "}
                characters
              </p>
            </div>
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Description</h2>
            </div>
            <LeafletEditor
              value={description}
              onChange={setDescription}
              placeholder="Full description of this cert."
              ariaLabel="Cert description"
              did={did ?? ""}
              onImageUpload={(file) =>
                uploadBlob(
                  file,
                  activeOrg ? { targetDid: activeOrg.groupDid } : undefined,
                )
              }
            />
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Contributors</h2>
              {contributors.length > 0 ? (
                <span className="cert-detail__section-count">
                  {contributors.length}
                </span>
              ) : null}
            </div>

            {contributors.length === 0 ? (
              <p className="cert-detail__empty-line">
                No contributors yet. Add one to credit collaborators.
              </p>
            ) : (
              <ul className="create-cert__contrib-list">
                {contributors.map((c, idx) => {
                  const identityValid = isContributorIdentityAcceptable(
                    c.identity,
                  )
                  const weightValid = isContributorWeightAcceptable(c.weight)
                  const normalized = normalizeIdentity(c.identity).toLowerCase()
                  const identityDuplicate =
                    normalized.length > 0 && duplicateIdentitySet.has(normalized)
                  const otherIdentities = new Set<string>()
                  for (const other of contributors) {
                    if (other.key === c.key) continue
                    const n = normalizeIdentity(other.identity).toLowerCase()
                    if (n) otherIdentities.add(n)
                  }
                  // Card vs typeahead input. Pre-filled rows arrive
                  // with `picked: true` so they render as cards on
                  // load; new rows start uncommitted and stay in
                  // input mode until the user explicitly commits
                  // (typeahead pick, Enter, or blur with a valid
                  // identity). Without the picked gate, the input
                  // would swap to a card mid-typing the moment the
                  // value matched the handle regex (e.g. `alice.so`
                  // matches; you couldn't reach `alice.social`).
                  const normalizedIdentity = normalizeIdentity(c.identity)
                  const showCard =
                    c.picked &&
                    identityValid &&
                    !identityDuplicate &&
                    normalizedIdentity.length > 0 &&
                    isAtprotoIdentity(normalizedIdentity)
                  return (
                    <li key={c.key} className="create-cert__contrib-row">
                      {showCard ? (
                        <ContributorIdentityCard
                          identity={normalizedIdentity}
                          ariaLabel={`Contributor ${idx + 1}`}
                          onClear={() =>
                            setContributors((rows) =>
                              rows.map((r) =>
                                r.key === c.key
                                  ? { ...r, identity: "", picked: false }
                                  : r,
                              ),
                            )
                          }
                        />
                      ) : (
                        <ContributorIdentityField
                          value={c.identity}
                          onChange={(nextVal) =>
                            setContributors((rows) =>
                              rows.map((r) =>
                                r.key === c.key ? { ...r, identity: nextVal } : r,
                              ),
                            )
                          }
                          onCommit={() =>
                            setContributors((rows) =>
                              rows.map((r) =>
                                r.key === c.key ? { ...r, picked: true } : r,
                              ),
                            )
                          }
                          ariaLabel={`Contributor ${idx + 1} identity`}
                          idx={idx}
                          invalid={!identityValid || identityDuplicate}
                          excludeIdentities={otherIdentities}
                        />
                      )}
                      <input
                        type="text"
                        className="cert-detail__meta-input"
                        aria-label={`Contributor ${idx + 1} role (optional)`}
                        placeholder="Role (optional)"
                        value={c.role}
                        maxLength={1000}
                        onChange={(e) =>
                          setContributors((rows) =>
                            rows.map((r) =>
                              r.key === c.key
                                ? { ...r, role: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        className={
                          weightValid
                            ? "cert-detail__meta-input create-cert__contrib-weight"
                            : "cert-detail__meta-input create-cert__contrib-weight create-cert__contrib-id-input--invalid"
                        }
                        aria-label={`Contributor ${idx + 1} weight (optional)`}
                        aria-invalid={!weightValid}
                        placeholder="Weight (optional)"
                        value={c.weight}
                        maxLength={100}
                        onChange={(e) =>
                          setContributors((rows) =>
                            rows.map((r) =>
                              r.key === c.key
                                ? { ...r, weight: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="create-cert__contrib-remove"
                        aria-label={`Remove contributor ${idx + 1}`}
                        onClick={() =>
                          setContributors((rows) =>
                            rows.filter((r) => r.key !== c.key),
                          )
                        }
                      >
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                      </button>
                      {!identityValid ? (
                        <p
                          className="create-cert__contrib-error"
                          role="alert"
                        >
                          Use a DID (did:plc:…) or a handle (alice.bsky.social).
                        </p>
                      ) : identityDuplicate ? (
                        <p
                          className="create-cert__contrib-error"
                          role="alert"
                        >
                          Already added — each contributor can only appear once.
                        </p>
                      ) : !weightValid ? (
                        <p
                          className="create-cert__contrib-error"
                          role="alert"
                        >
                          Weight must be a number (decimals are fine, e.g. 1.5).
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="create-cert__contrib-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setContributors((rows) => [...rows, freshContributor()])
                }
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                Add contributor
              </Button>
              {selfInfo && (selfInfo.handle || selfInfo.did) ? (
                (() => {
                  const selfIdentity =
                    selfInfo.handle && selfInfo.handle !== selfInfo.did
                      ? `@${selfInfo.handle}`
                      : selfInfo.did
                  const selfNormalised = normalizeIdentity(
                    selfIdentity,
                  ).toLowerCase()
                  const alreadyAdded = contributors.some(
                    (c) =>
                      normalizeIdentity(c.identity).toLowerCase() ===
                      selfNormalised,
                  )
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={alreadyAdded}
                      onClick={() =>
                        setContributors((rows) => [
                          ...rows,
                          { ...freshContributor(), identity: selfIdentity, picked: true },
                        ])
                      }
                      title={
                        alreadyAdded
                          ? "Already on the list"
                          : `Add ${selfIdentity} as a contributor`
                      }
                    >
                      Add me
                    </Button>
                  )
                })()
              ) : null}
            </div>
          </section>

        </div>
      </article>

      {isLocationDialogOpen && sessionDid ? (
        <LocationPickerDialog
          ownDid={sessionDid}
          targetDid={effectivePublisherDid}
          onClose={() => setIsLocationDialogOpen(false)}
          onPick={(added: AddedLocation) => {
            setLocations((rows) => {
              if (rows.some((r) => r.ref.uri === added.ref.uri)) return rows
              return [...rows, { ref: added.ref, name: added.name }]
            })
            setIsLocationDialogOpen(false)
          }}
        />
      ) : null}
    </form>
  )
}
