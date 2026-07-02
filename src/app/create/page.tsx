"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { recordUrl } from "@/lib/urls"
import { useRouter } from "next/navigation"
import {
  Calendar,
  FileText,
  MapPin,
  Plus,
  Search,
  Target,
  Trash2,
  X,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
import LoadingSpinner from "@/components/ui/loading-spinner"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import { PenLine } from "lucide-react"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { useAuthorInfo } from "@/hooks/use-author-info"
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
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import type { StrongRef } from "@/lib/atproto/location"
import { usePageTitle } from "@/lib/navbar-context"
import { useTour } from "@/lib/tour/tour-context"
import { countGraphemes } from "@/lib/utils/graphemes"

/**
 * `/create` — new cert. Mirrors the visual language of the cert detail
 * page (`page-layout cert-detail--wide`) so the editing flow reads as
 * "you're shaping a draft cert that will look exactly like this when
 * published." Surfaces every field the
 * `org.hypercerts.claim.activity` lexicon supports as an inline form:
 *
 *   Required (lexicon-required):
 *     - title             (string, max 256)
 *     - shortDescription  (string, max 300 graphemes)
 *     - createdAt         (auto-stamped at submit)
 *
 *   Inline-editable here:
 *     - description       (Leaflet LinearDocument)
 *     - startDate         (datetime — emitted as ISO from a date input)
 *     - endDate           (datetime — same)
 *     - workScope         (free-form string → `#workScopeString` variant)
 *     - contributors[]    (inline `#contributorIdentity` rows with
 *                          optional weight + `#contributorRole`)
 *     - image             (BlobRef via uploadBlob; wrapped as
 *                          `org.hypercerts.defs#smallImage` on save)
 *     - locations[]       (strongRefs to fresh app.certified.location
 *                          records — created from a search-and-pin
 *                          dialog — OR pasted at:// URIs of existing
 *                          records)
 *     - rights            (strongRef chosen from the dropdown of
 *                          org.hypercerts.claim.rights records
 *                          published by RIGHTS_PUBLISHER_DID)
 *
 *   shortDescriptionFacets is derived at parse time elsewhere; the
 *   form itself stays plain-text.
 */

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/

/**
 * Single curated publisher of org.hypercerts.claim.rights records.
 * The rights dropdown lists every record under this DID's collection
 * and uses the record's `rightsName` as the user-facing label. If
 * additional publishers come online later, swap this for a discovery
 * step (search index, indexer query, etc.).
 */
const RIGHTS_PUBLISHER_DID = "did:plc:s4puetfspot742ai7y4otuel"
const RIGHTS_COLLECTION = "org.hypercerts.claim.rights"

interface ContributorRow {
  /** Stable key — survives reorders and the trash button. */
  key: string
  identity: string
  weight: string
  role: string
  /** True once the identity has been "committed" — a typeahead pick,
   *  Enter, or blur with a valid value. Drives whether the row
   *  renders the read-only contributor card (true) or the typeahead
   *  input (false). New rows start uncommitted so the user can keep
   *  typing past intermediate matches like `alice.so` on the way to
   *  `alice.social`. */
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

// Contributor helpers (normalizeIdentity, isContributorIdentityAcceptable,
// isContributorWeightAcceptable) and the ContributorIdentityField
// typeahead are imported from
// `@/components/create/contributor-identity-field` so the /project/new
// form can reuse them.

// `AddedLocation` is re-exported from
// `@/components/create/location-picker-dialog` so the project form
// can use the same shape.

interface RightsOption {
  ref: StrongRef
  name: string
}

export default function CreatePage() {
  usePageTitle("New activity")
  const { isAuthenticated, isLoading, did } = useAuth()
  const { activeOrg } = useOrg()
  const router = useRouter()
  // During the product tour, don't auto-focus the title — the tour's
  // arrow-key navigation needs focus on its own card, not trapped in this
  // field (the "Give it a title" step highlights it without typing in it).
  const { isActive: tourActive } = useTour()
  // "Effective identity" — the DID the cert is published as on
  // this page. When the user has switched into a group, that's the
  // group's DID; otherwise their own session DID. Used anywhere
  // "self" matters here (Add me shortcut, blob target repo,
  // submit destination) so the form treats the active identity as
  // a first-class subject rather than always falling through to the
  // personal user.
  const effectiveDid: string =
    activeOrg?.groupDid ?? did ?? ""
  // Author info for whoever is currently publishing — feeds the
  // "Add me" shortcut on the contributors row. `useAuthorInfo`
  // resolves the handle (preferred) and falls back to the DID.
  const { info: selfInfo } = useAuthorInfo(effectiveDid)

  const [arrivedFromInApp] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null
      return !!referrer && referrer.origin === window.location.origin
    } catch {
      return false
    }
  })

  // Scalar fields. Dates use the HTML date-input shape (YYYY-MM-DD)
  // and are upcast to ISO datetime at submit so the lexicon's
  // datetime format is respected.
  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [workScope, setWorkScope] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [contributors, setContributors] = useState<ContributorRow[]>([])

  // Image — same staging pattern activity-detail uses: a local object
  // URL drives the preview while the blob is being uploaded; once the
  // upload settles, `pendingImageBlob` holds the BlobRef we'll attach
  // to the cert record on submit.
  const [pendingImageBlob, setPendingImageBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] =
    useState<string | null>(null)

  // Locations — array of strongRefs we've already written (or resolved
  // from a pasted URI). New entries are added via the dialog below.
  const [locations, setLocations] = useState<AddedLocation[]>([])
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)

  // Rights — single strongRef. Options come from listRecords on the
  // curated publisher DID. We keep the rkey on the value so the
  // <select> can drive controlled state.
  const [rightsOptions, setRightsOptions] = useState<RightsOption[]>([])
  const [rightsLoading, setRightsLoading] = useState(true)
  const [rightsLoadError, setRightsLoadError] = useState<string | null>(null)
  const [rightsUri, setRightsUri] = useState<string>("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Revoke any staged preview URL on unmount so the blob URL doesn't
  // linger in memory after the user navigates away mid-flow.
  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    }
  }, [pendingImagePreviewUrl])

  // Fetch the rights options once — listRecords under
  // RIGHTS_PUBLISHER_DID's `org.hypercerts.claim.rights` collection.
  // No pagination handling: the assumption is the curated publisher
  // maintains a small set (well under the 100-record listRecords
  // default page). Records without a `rightsName` fall back to the
  // rkey so the option still selectable.
  useEffect(() => {
    const controller = new AbortController()
    setRightsLoading(true)
    setRightsLoadError(null)
    const params = new URLSearchParams({
      repo: RIGHTS_PUBLISHER_DID,
      collection: RIGHTS_COLLECTION,
      limit: "100",
    })
    authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`listRecords failed: ${res.status}`)
        }
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
        // Stable, name-sorted order so the dropdown reads alphabetically.
        opts.sort((a, b) => a.name.localeCompare(b.name))
        setRightsOptions(opts)
        // Default selection: "Public Display of Contributions" —
        // the most permissive option in the curated rights set, so
        // a brand-new cert is publishable without forcing the
        // author to make a rights decision they probably haven't
        // thought about yet. Match by exact name; if the publisher
        // ever renames it, the dropdown still functions (the user
        // just has to pick manually).
        const defaultPick = opts.find(
          (o) => o.name === "Public Display of Contributions",
        )
        if (defaultPick) {
          setRightsUri((prev) => (prev ? prev : defaultPick.ref.uri))
        }
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

  const titleCount = countGraphemes(title)
  const shortDescCount = countGraphemes(shortDescription)
  // Lexicon caps: title.maxLength = 256 (bytes), shortDescription
  // maxGraphemes = 300. Minimums are our product floor, not a
  // lexicon constraint — kept here so the validation gate +
  // counter copy stay in sync.
  const TITLE_MIN = 5
  const TITLE_MAX = 256
  const SHORT_DESC_MIN = 100
  const SHORT_DESC_MAX = 300

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
    locations,
    rightsUri,
  ])

  // Image upload handler — mirrors activity-detail.handleImageFile.
  // Optimistically swaps in a local-object-URL preview while the
  // blob upload is in flight; once it settles, the BlobRef is held
  // in state until cert-create-submit attaches it to the record.
  const handleImageFile = useCallback(async (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return previewUrl
    })
    // Route the blob upload to the group's repo when the active
    // identity is a group; otherwise the user's own.
    const targetDid = activeOrg ? activeOrg.groupDid : null
    try {
      const blob = await uploadBlob(
        file,
        targetDid ? { targetDid } : undefined,
      )
      setPendingImageBlob(blob)
    } catch (err) {
      // Surface the failure and clear the dangling optimistic preview so
      // the form can't be published with an image that never uploaded.
      setError(
        err instanceof Error ? err.message : "Image upload failed",
      )
      setPendingImageBlob(null)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [activeOrg])

  const handleImageRemove = useCallback(() => {
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  // Auth state takes a tick to resolve on refresh — the session is
  // restored from a cookie via `/api/auth/session` and that round-
  // trip hasn't completed yet. During that window `isAuthenticated`
  // is false but the user is in fact signed in. Surfacing a
  // "Sign in to create" message during the loading window felt
  // jarring on every refresh; we now render a quiet spinner until
  // the session check settles.
  if (isLoading) {
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
              title="Sign in to create"
              description="You need to be signed in to create an activity claim."
            />
          </div>
        </div>
      </div>
    )
  }

  // When the user has switched into a group, the cert is published
  // on the group's repo via the BFF route. The /create form is
  // identical either way — only the submit path differs (see
  // handleSubmit's targetDid branch).

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!did) return
    // Guard against the form firing past the disabled submit button
    // (Enter-key submit in a child input would still trigger
    // handleSubmit). Same bounds the submit-disable check enforces.
    const trimT = countGraphemes(title.trim())
    const trimS = countGraphemes(shortDescription.trim())
    if (trimT < TITLE_MIN || trimS < SHORT_DESC_MIN) return
    if (titleCount > TITLE_MAX || shortDescCount > SHORT_DESC_MAX) return
    if (
      !contributors.every(
        (c) =>
          isContributorIdentityAcceptable(c.identity) &&
          isContributorWeightAcceptable(c.weight),
      )
    ) {
      return
    }
    {
      const seen = new Set<string>()
      for (const c of contributors) {
        const n = normalizeIdentity(c.identity).toLowerCase()
        if (!n) continue
        if (seen.has(n)) return
        seen.add(n)
      }
    }
    // Time-period sanity: start must not be after end. Both fields
    // are optional; only enforce when the user filled both.
    if (startDate && endDate && startDate > endDate) return

    setIsSubmitting(true)
    setError(null)

    // Build the record payload. Optional fields are added only when
    // populated so the lexicon doesn't receive empty strings or
    // empty arrays that mean something different from "absent".
    type ClaimActivityRecord = {
      $type: "org.hypercerts.claim.activity"
      title: string
      shortDescription: string
      createdAt: string
      description?: LinearDocument
      startDate?: string
      endDate?: string
      workScope?: {
        $type: "org.hypercerts.claim.activity#workScopeString"
        scope: string
      }
      contributors?: Array<{
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity"
          identity: string
        }
        contributionWeight?: string
        contributionDetails?: {
          $type: "org.hypercerts.claim.activity#contributorRole"
          role: string
        }
      }>
      image?: HypercertsSmallImage
      locations?: StrongRef[]
      rights?: StrongRef
    }
    const record: ClaimActivityRecord = {
      $type: "org.hypercerts.claim.activity",
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      createdAt: new Date().toISOString(),
    }
    if (description && description.blocks.length > 0) {
      record.description = description
    }
    if (startDate) {
      // YYYY-MM-DD → ISO datetime at start of day in UTC. The
      // lexicon stores datetime; midnight UTC is the conventional
      // "all we know is the date" anchor.
      record.startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString()
    }
    if (endDate) {
      record.endDate = new Date(`${endDate}T00:00:00.000Z`).toISOString()
    }
    if (workScope.trim()) {
      record.workScope = {
        $type: "org.hypercerts.claim.activity#workScopeString",
        scope: workScope.trim(),
      }
    }
    const seenSaveIdentities = new Set<string>()
    const populatedContributors: NonNullable<
      ClaimActivityRecord["contributors"]
    > = []
    for (const c of contributors) {
      const norm = normalizeIdentity(c.identity)
      if (!norm) continue
      const key = norm.toLowerCase()
      if (seenSaveIdentities.has(key)) continue
      seenSaveIdentities.add(key)
      const entry: NonNullable<ClaimActivityRecord["contributors"]>[number] = {
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity",
          // Store the canonical form — strip the `@` that the
          // typeahead writes back into the field on pick — so
          // downstream `/api/resolve-did?handle=…` queries don't
          // have to special-case the prefix.
          identity: norm,
        },
      }
      if (c.weight.trim()) entry.contributionWeight = c.weight.trim()
      if (c.role.trim()) {
        entry.contributionDetails = {
          $type: "org.hypercerts.claim.activity#contributorRole",
          role: c.role.trim(),
        }
      }
      populatedContributors.push(entry)
    }
    if (populatedContributors.length > 0) {
      record.contributors = populatedContributors
    }
    if (pendingImageBlob) {
      record.image = {
        $type: "org.hypercerts.defs#smallImage",
        image: pendingImageBlob as unknown as BlobRef,
      }
    }
    if (locations.length > 0) {
      record.locations = locations.map((l) => l.ref)
    }
    if (rightsUri) {
      const chosen = rightsOptions.find((o) => o.ref.uri === rightsUri)
      if (chosen) record.rights = chosen.ref
    }

    try {
      // Route through the group BFF when the user has switched into
      // a group identity; otherwise use the xrpc proxy on the
      // viewer's own repo. The BFF's PUT route accepts
      // `{ record }` with no rkey → createRecord on the group repo.
      const useGroupRoute = activeOrg !== null
      const url = useGroupRoute
        ? `/api/groups/${encodeURIComponent(effectiveDid)}/activity`
        : "/api/xrpc/com/atproto/repo/createRecord"
      const method = useGroupRoute ? "PUT" : "POST"
      const body = useGroupRoute
        ? { record }
        : {
            repo: effectiveDid,
            collection: "org.hypercerts.claim.activity",
            record,
          }
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Failed: ${res.status}`)
      }

      const uri: unknown = data?.uri
      const match = typeof uri === "string" ? AT_URI_RE.exec(uri) : null
      if (match) {
        const [, ownerDid, , rkey] = match
        router.push(
          recordUrl(ownerDid, "activity", rkey),
        )
      } else {
        router.push("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsSubmitting(false)
    }
  }

  // Validation gates the submit button. Title + short description
  // both have min + max bounds; we count graphemes (visible chars)
  // not code units. Trimmed length keeps "    " from counting as
  // five real characters.
  const trimmedTitleCount = countGraphemes(title.trim())
  const trimmedShortDescCount = countGraphemes(shortDescription.trim())
  const titleUnder = trimmedTitleCount > 0 && trimmedTitleCount < TITLE_MIN
  const titleOver = titleCount > TITLE_MAX
  const shortDescUnder =
    trimmedShortDescCount > 0 && trimmedShortDescCount < SHORT_DESC_MIN
  const shortDescOver = shortDescCount > SHORT_DESC_MAX
  // Contributors gate: every row that has been started must resolve
  // to a proper DID or handle. Empty rows are dropped at save time
  // so they don't fail this check. Additionally, the same identity
  // cannot appear twice — compare normalised (lowercased, @-stripped)
  // forms so "@Alice.bsky.social" + "alice.bsky.social" register as
  // the same contributor.
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
  // Date inputs use the lexicographically-sortable YYYY-MM-DD shape
  // browsers emit for `<input type="date">`, so a plain string
  // comparison is equivalent to a calendar comparison. Equal dates
  // are allowed (the cert covers a single day). Empty values bypass
  // the check.
  const datesValid =
    !startDate || !endDate || startDate <= endDate
  const canSubmit =
    trimmedTitleCount >= TITLE_MIN &&
    titleCount <= TITLE_MAX &&
    trimmedShortDescCount >= SHORT_DESC_MIN &&
    shortDescCount <= SHORT_DESC_MAX &&
    allContributorsValid &&
    noContributorDuplicates &&
    datesValid &&
    !isSubmitting

  return (
    <form onSubmit={handleSubmit}>
      <article className="page-layout cert-detail--wide create-cert">
        <aside className="cert-detail__aside" aria-label="Activity metadata">
          {/* Image slot — `--editing` carries the dashed outline that
              signals "click here to set an image", matching the
              inline-edit mode of the detail page. When a blob is
              staged the preview displays; the overlay's "Change image"
              pill flips to "Replace image". */}
          <div className="cert-detail__image cert-detail__image--editing">
            {pendingImagePreviewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={pendingImagePreviewUrl}
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
              hasImage={!!pendingImageBlob}
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
                  {/* Native `type="date"` keeps the calendar picker
                      affordance the user expects. The .value
                      attribute is ALWAYS ISO 8601 `YYYY-MM-DD`
                      regardless of the locale-dependent visual
                      formatting in the field (en-US: MM/DD/YYYY,
                      en-GB: DD/MM/YYYY, etc.) — so the stored
                      string the submit handler consumes is ISO
                      either way. The displayed text format is
                      controlled by the browser/OS locale and can't
                      be overridden without dropping the picker UI. */}
                  {/* flex-[1_1_0] + min-w-0 reproduce the legacy
                      `.create-cert__date-row .cert-detail__meta-input`
                      rule so the two date fields split the row evenly
                      (the bare input is otherwise content-width). */}
                  <Input
                    flush
                    density="compact"
                    borderWeight="hover"
                    type="date"
                    aria-label="Start date"
                    className="flex-[1_1_0] min-w-0"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span aria-hidden>→</span>
                  <Input
                    flush
                    density="compact"
                    borderWeight="hover"
                    type="date"
                    aria-label="End date"
                    // Preserve the exact legacy invalid treatment from
                    // `.create-cert__contrib-id-input--invalid` (solid
                    // --color-error border + red focus ring), which is a
                    // heavier cue than the primitive's translucent
                    // `error` border. Applied via className so it wins
                    // over the borderWeight="hover" resting border.
                    className={
                      datesValid
                        ? "flex-[1_1_0] min-w-0"
                        : "flex-[1_1_0] min-w-0 !border-[var(--color-error)] focus:!border-[var(--color-error)] focus:!ring-2 focus:!ring-[var(--color-error)]/15"
                    }
                    aria-invalid={!datesValid}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                {!datesValid ? (
                  <p
                    className="create-cert__contrib-error"
                    role="alert"
                  >
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
                <Input
                  flush
                  density="compact"
                  borderWeight="hover"
                  type="text"
                  aria-label="Work scope"
                  className="create-cert__field--full"
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
                  <span className="cert-detail__meta-aux">
                    None available
                  </span>
                ) : (
                  // NOTE: left as a native <select> with the compact
                  // `cert-detail__meta-input` chrome. The <Select>
                  // primitive only exposes a sm/md/lg size axis (no
                  // `density="compact"`), and its smallest size (sm =
                  // h-9, 1px --border-default) is taller and lighter
                  // than this 0.8125rem / 1.5px --border-hover meta
                  // field — adopting it would change the inline meta-row
                  // rhythm. Migrate once <Select> grows a compact
                  // density that matches the meta-input scale.
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
              {/* Bare/flush <Input> so the title typography cascades.
                  The serif headline scale, weight, tracking, and the
                  1.375rem create-form size are carried inline here
                  (the legacy `.cert-detail__title-input` +
                  `.create-cert .cert-detail__title-input` rules that
                  used to supply them are now dead). borderWeight="hover"
                  reproduces the 1.5px --border-hover / --fg-primary
                  focus chrome the legacy class painted. */}
              <Input
                flush
                size="bare"
                borderWeight="hover"
                type="text"
                aria-label="Title"
                placeholder="Title for your activity"
                className="flex-[1_1_auto] min-w-0 font-headline !text-[1.375rem] font-bold !leading-[1.15] tracking-[-0.015em] text-[var(--fg-primary)] !px-2.5 py-1"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus={!tourActive}
                data-tour="create-title"
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
                {shortDescCount}/{SHORT_DESC_MAX} · min. {SHORT_DESC_MIN} characters
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
              placeholder="Full description of this activity. Headings, lists, links, images, and video embeds are all supported via the toolbar."
              ariaLabel="Activity description"
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
                  // Other rows' normalised identities — passed into the
                  // typeahead so the dropdown can hide actors that are
                  // already on the list. Keeps duplicates from being
                  // introduced through the autocomplete path; manual
                  // typing of a duplicate still surfaces the inline
                  // "Already added" error.
                  const otherIdentities = new Set<string>()
                  for (const other of contributors) {
                    if (other.key === c.key) continue
                    const n = normalizeIdentity(other.identity).toLowerCase()
                    if (n) otherIdentities.add(n)
                  }
                  // Card vs typeahead input. The card only renders once
                  // the row has been EXPLICITLY committed (typeahead
                  // pick, Enter, or blur with a valid value) — typing
                  // alone doesn't swap, so the user can transit through
                  // intermediate matches like `alice.so` on the way to
                  // `alice.social`. Duplicates always stay in input
                  // mode so the inline "Already added" error stays
                  // visible.
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
                        onChange={(next) =>
                          setContributors((rows) =>
                            rows.map((r) =>
                              r.key === c.key ? { ...r, identity: next } : r,
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
                    <Input
                      flush
                      density="compact"
                      borderWeight="hover"
                      type="text"
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
                    <Input
                      flush
                      density="compact"
                      borderWeight="hover"
                      type="text"
                      inputMode="decimal"
                      // `create-cert__contrib-weight` keeps the row's
                      // text-align:left layout. Invalid border matches
                      // the legacy `--invalid` (solid --color-error +
                      // red focus ring), applied via className so it
                      // wins over borderWeight="hover".
                      className={
                        weightValid
                          ? "create-cert__contrib-weight"
                          : "create-cert__contrib-weight !border-[var(--color-error)] focus:!border-[var(--color-error)] focus:!ring-2 focus:!ring-[var(--color-error)]/15"
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
              {/* "Add me" shortcut — prefills a fresh contributor row
                  with the signed-in user's @handle (or DID if no
                  handle resolved). Skipped if the user has already
                  added themselves so duplicate rows aren't created.
                  Disabled until the author info loads (no point
                  spawning a blank row that says "@undefined"). */}
              {selfInfo && (selfInfo.handle || selfInfo.did) ? (
                (() => {
                  const selfIdentity =
                    selfInfo.handle && selfInfo.handle !== selfInfo.did
                      ? `@${selfInfo.handle}`
                      : selfInfo.did
                  // Match the signed-in user against contributor rows by
                  // EITHER their handle or their DID — a row may hold
                  // either form (an existing activity stores contributor
                  // DIDs; a typeahead pick may store a handle), and
                  // comparing only `selfIdentity` would miss the other
                  // form and wrongly leave "Add me" enabled for someone
                  // already on the list.
                  const selfKeys = new Set(
                    [selfInfo.handle, selfInfo.did]
                      .filter((v): v is string => !!v)
                      .map((v) => normalizeIdentity(v).toLowerCase()),
                  )
                  const alreadyAdded = contributors.some((c) =>
                    selfKeys.has(
                      normalizeIdentity(c.identity).toLowerCase(),
                    ),
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
                          {
                            ...freshContributor(),
                            identity: selfIdentity,
                            picked: true,
                          },
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

          {error ? (
            <p className="cert-detail__error-desc" role="alert">
              {error}
            </p>
          ) : null}

          <div className="create-cert__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (arrivedFromInApp) router.back()
                else router.push("/")
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={!canSubmit}
              data-tour="create-submit"
            >
              {isSubmitting ? "Publishing…" : "Publish activity"}
            </Button>
          </div>
        </div>
      </article>

      {isLocationDialogOpen && did ? (
        <LocationPickerDialog
          ownDid={did}
          targetDid={effectiveDid}
          onClose={() => setIsLocationDialogOpen(false)}
          onPick={(added) => {
            setLocations((rows) => {
              // Don't duplicate the same URI if the user picked an
              // already-attached existing record.
              if (rows.some((r) => r.ref.uri === added.ref.uri)) return rows
              return [...rows, added]
            })
            setIsLocationDialogOpen(false)
          }}
        />
      ) : null}
    </form>
  )
}

