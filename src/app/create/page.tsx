"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import LoadingSpinner from "@/components/ui/loading-spinner"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import Map from "@/components/map/map-dynamic"
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
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import {
  parseLocationShape,
  putLocationRecord,
  splitLocationName,
  type LatLng,
  type StrongRef,
} from "@/lib/atproto/location"
import {
  reverseGeocode,
  suggestForwardGeocode,
  type ForwardGeocodeResult,
} from "@/lib/locations/geocode"
import { usePageTitle } from "@/lib/navbar-context"

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
}

function freshContributor(): ContributorRow {
  return {
    key: `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identity: "",
    weight: "",
    role: "",
  }
}

// Contributor helpers (normalizeIdentity, isContributorIdentityAcceptable,
// isContributorWeightAcceptable) and the ContributorIdentityField
// typeahead are imported from
// `@/components/create/contributor-identity-field` so the /project/new
// form can reuse them.

interface AddedLocation {
  /** strongRef to the freshly-written or resolved location record. */
  ref: StrongRef
  /** Display name pulled out of the record for the list below the
   *  meta row. Falls back to the URI if no name was set. */
  name: string
}

interface RightsOption {
  ref: StrongRef
  name: string
}

export default function CreatePage() {
  usePageTitle("New cert")
  const { isAuthenticated, isLoading, did } = useAuth()
  const { activeOrg } = useOrg()
  const router = useRouter()
  // Author info for the signed-in user — fuels the "Add me" shortcut
  // on the contributors row. `useAuthorInfo` resolves the handle
  // (preferred) and falls back to the DID when none is registered.
  const { info: selfInfo } = useAuthorInfo(did)

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

  // Grapheme counter — the lexicon caps shortDescription at 300
  // graphemes (not bytes). Intl.Segmenter is the right tool;
  // older browsers fall back to `Array.from(str).length` which
  // counts code points (close enough at the 300-cap range and
  // never overestimates). Reused for the title counter too so
  // both fields count "visible characters" rather than raw code
  // units — emoji + grapheme clusters then count as one.
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
    const blob = await uploadBlob(
      file,
      targetDid ? { targetDid } : undefined,
    )
    setPendingImageBlob(blob)
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
      const targetDid = activeOrg ? activeOrg.groupDid : did
      const useGroupRoute = activeOrg !== null
      const url = useGroupRoute
        ? `/api/groups/${encodeURIComponent(targetDid)}/activity`
        : "/api/xrpc/com/atproto/repo/createRecord"
      const method = useGroupRoute ? "PUT" : "POST"
      const body = useGroupRoute
        ? { record }
        : {
            repo: targetDid,
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
          `/activity/${encodeURIComponent(ownerDid)}/${encodeURIComponent(rkey)}`,
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
  const canSubmit =
    trimmedTitleCount >= TITLE_MIN &&
    titleCount <= TITLE_MAX &&
    trimmedShortDescCount >= SHORT_DESC_MIN &&
    shortDescCount <= SHORT_DESC_MAX &&
    allContributorsValid &&
    noContributorDuplicates &&
    !isSubmitting

  return (
    <form onSubmit={handleSubmit}>
      <article className="page-layout cert-detail--wide create-cert">
        <aside className="cert-detail__aside" aria-label="Cert metadata">
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
                    className="cert-detail__meta-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
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
                  <span className="cert-detail__meta-aux">
                    None available
                  </span>
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
              placeholder="Full description of this cert. Headings, lists, links, images, and video embeds are all supported via the toolbar."
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
                  return (
                  <li key={c.key} className="create-cert__contrib-row">
                    <ContributorIdentityField
                      value={c.identity}
                      onChange={(next) =>
                        setContributors((rows) =>
                          rows.map((r) =>
                            r.key === c.key ? { ...r, identity: next } : r,
                          ),
                        )
                      }
                      ariaLabel={`Contributor ${idx + 1} identity`}
                      idx={idx}
                      invalid={!identityValid || identityDuplicate}
                      excludeIdentities={otherIdentities}
                    />
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
                          {
                            ...freshContributor(),
                            identity: selfIdentity,
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
            >
              {isSubmitting ? "Publishing…" : "Publish cert"}
            </Button>
          </div>
        </div>
      </article>

      {isLocationDialogOpen && did ? (
        <LocationPickerDialog
          ownDid={did}
          targetDid={activeOrg ? activeOrg.groupDid : did}
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

// ----------------------------------------------------------------------
// Location picker dialog
//
// Two modes:
//   - "new"      — name + map + autocomplete; on save, writes a fresh
//                  app.certified.location record under the user's repo
//                  via putLocationRecord and returns the strongRef.
//   - "existing" — pasted at:// URI; resolves the record via
//                  readLocationStrongRef and returns its strongRef.
//
// The dialog drops the resolved entry back into the parent via onPick
// and closes. The parent owns the locations array.
// ----------------------------------------------------------------------

interface LocationPickerDialogProps {
  /** The signed-in user's own DID — used as the My-locations source
   *  (we list the *user*'s previously-published locations, not the
   *  active group's). */
  ownDid: string
  /** The repo a new location record will be written to. Equals
   *  `ownDid` for personal certs; the active group's DID when the
   *  user has switched into a group identity. */
  targetDid: string
  onClose: () => void
  onPick: (added: AddedLocation) => void
}

function LocationPickerDialog({
  ownDid,
  targetDid,
  onClose,
  onPick,
}: LocationPickerDialogProps) {
  // Default tab is "existing" — most authors are picking from a
  // location they already published rather than minting a fresh
  // record. The "New" tab is one click away when they want a new
  // place.
  const [mode, setMode] = useState<"new" | "existing">("existing")

  // ----- New-record fields -----
  // One field, two modes:
  //   "search" — user is typing to find a place. Nominatim
  //              suggestions appear in a dropdown beneath. Picking a
  //              suggestion (or clicking the map) flips us into
  //              "edit" mode.
  //   "edit"   — user is refining the saved name (e.g. "Main office"
  //              instead of "123 Main St, San Francisco, CA, United
  //              States"). Typing does NOT re-fire a search; the
  //              dropdown stays closed.
  // Clearing the field flips back to "search" so the user can find
  // a new place after the initial pick.
  const [name, setName] = useState("")
  const [fieldMode, setFieldMode] = useState<"search" | "edit">("search")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [suggestions, setSuggestions] = useState<ForwardGeocodeResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [busy, setBusy] = useState<"idle" | "forward" | "reverse">("idle")
  const blurTimerRef = useRef<number | null>(null)

  // ----- Existing-record state -----
  // The "Existing" mode lists the signed-in user's own previously
  // published `app.certified.location` records. We fetch them on
  // mount via listRecords on their repo; the dropdown shows the
  // record's `name`, the strongRef + name flow back through onPick
  // exactly the same as a freshly-created record would. `coords`
  // is parsed from the record's `location` field via
  // `parseLocationShape` so picking a location can drop a pin on
  // the map preview; smallBlob variants resolve to `null` (we'd
  // need to fetch the blob to extract lat/lng) and just won't
  // pin — the strongRef is still attached on Add.
  interface MyLocation {
    ref: StrongRef
    name: string
    coords: LatLng | null
  }
  const [myLocations, setMyLocations] = useState<MyLocation[]>([])
  const [myLocationsLoading, setMyLocationsLoading] = useState(true)
  const [myLocationsError, setMyLocationsError] = useState<string | null>(null)
  const [selectedExistingUri, setSelectedExistingUri] = useState<string>("")

  useEffect(() => {
    const controller = new AbortController()
    setMyLocationsLoading(true)
    setMyLocationsError(null)
    const params = new URLSearchParams({
      repo: ownDid,
      collection: "app.certified.location",
      limit: "100",
    })
    authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`listRecords failed: ${res.status}`)
        const body = (await res.json()) as {
          records?: Array<{
            uri: string
            cid: string
            value?: {
              name?: unknown
              locationType?: unknown
              location?: unknown
            }
          }>
        }
        const opts: MyLocation[] = (body.records ?? []).map((rec) => {
          const rawName =
            typeof rec.value?.name === "string" ? rec.value.name.trim() : ""
          // Strip the Plus Code prefix so the dropdown reads as the
          // human place ("Timbi-Madina, Guinée") not the code.
          const split = rawName ? splitLocationName(rawName) : null
          const display =
            split?.name ||
            rawName ||
            rec.uri.split("/").pop() ||
            "(unnamed location)"
          const lt =
            typeof rec.value?.locationType === "string"
              ? rec.value.locationType
              : undefined
          const shape = parseLocationShape(lt, rec.value?.location)
          // Only point shapes give a single pin to drop on the map;
          // polygons fall back to no pin (the dropdown still picks
          // them up — the cert detail page can render the polygon).
          const coords = shape?.kind === "point" ? shape.point : null
          return {
            ref: { uri: rec.uri, cid: rec.cid },
            name: display,
            coords,
          }
        })
        opts.sort((a, b) => a.name.localeCompare(b.name))
        setMyLocations(opts)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setMyLocationsError(
          err instanceof Error ? err.message : "Failed to load locations",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setMyLocationsLoading(false)
      })
    return () => controller.abort()
  }, [ownDid])

  // ----- Submit state -----
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Info banner shown when a "New" submit was short-circuited to an
  // existing My locations entry. Holds the matched location's
  // display name so the user knows which record was reused.
  const [reusedExistingName, setReusedExistingName] = useState<string | null>(
    null,
  )

  // Forward-geocode autocomplete — fires only while the field is in
  // "search" mode (i.e. before the user has picked anything OR after
  // they cleared the field). Picking a place flips into "edit" mode
  // so subsequent typing renames the saved value without spawning
  // fresh suggestions. 350ms debounce keeps Nominatim out of trouble.
  useEffect(() => {
    if (mode !== "new" || fieldMode !== "search") return
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      return
    }
    const ctrl = new AbortController()
    setBusy("forward")
    const t = window.setTimeout(async () => {
      const hits = await suggestForwardGeocode(trimmed, 6, ctrl.signal)
      setBusy("idle")
      setSuggestions(hits)
      setHighlightIndex(hits.length > 0 ? 0 : -1)
    }, 350)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
      setBusy("idle")
    }
  }, [name, mode, fieldMode])

  const pickSuggestion = (hit: ForwardGeocodeResult) => {
    setCoords({ lat: hit.lat, lng: hit.lng })
    setName(hit.displayName)
    setFieldMode("edit")
    setDropdownOpen(false)
    setSuggestions([])
    setHighlightIndex(-1)
  }

  const handleMapClick = async (latlng: { lat: number; lng: number }) => {
    setCoords(latlng)
    setBusy("reverse")
    setDropdownOpen(false)
    const hit = await reverseGeocode(latlng.lat, latlng.lng)
    setBusy("idle")
    if (hit?.displayName) setName(hit.displayName)
    setFieldMode("edit")
  }

  // Re-enter "search" mode using the current field value as the
  // query. Used by the Enter key (in edit mode) and the inline
  // search icon button. Flipping fieldMode triggers the
  // forward-geocode effect, which will populate suggestions
  // automatically on the next debounce cycle.
  const triggerSearchAgain = () => {
    setFieldMode("search")
    setDropdownOpen(true)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Always swallow Enter so it can't submit the outer /create
    // form. The dialog is rendered inside the publish form, so an
    // unprevented Enter in this input would post the cert mid-edit.
    if (e.key === "Enter") {
      e.preventDefault()
      // In search mode with an open dropdown, pick the highlighted
      // suggestion (or the first match) — matches typical combobox
      // affordance.
      if (
        fieldMode === "search" &&
        dropdownOpen &&
        suggestions.length > 0
      ) {
        const pick = suggestions[highlightIndex] ?? suggestions[0]
        if (pick) pickSuggestion(pick)
        return
      }
      // Otherwise (edit mode, or search mode with no open dropdown)
      // re-enter search mode using the current value. Lets the user
      // hit Enter to look up a different address without first
      // clearing the rename they may have already typed.
      triggerSearchAgain()
      return
    }
    if (!dropdownOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setDropdownOpen(true)
        setHighlightIndex(0)
        e.preventDefault()
      }
      return
    }
    if (e.key === "ArrowDown") {
      setHighlightIndex((i) => Math.min(suggestions.length - 1, i + 1))
      e.preventDefault()
    } else if (e.key === "ArrowUp") {
      setHighlightIndex((i) => Math.max(0, i - 1))
      e.preventDefault()
    } else if (e.key === "Escape") {
      setDropdownOpen(false)
      e.preventDefault()
    }
  }

  const canSubmitNew = !!coords && !isSaving
  const canSubmitExisting = !!selectedExistingUri && !isSaving

  const handleSubmitNew = async () => {
    if (!coords) return
    // Short-circuit: if the picked coordinates already match a
    // record in My locations, reuse the existing strongRef instead
    // of minting a duplicate. Match precision is 4 decimals
    // (~11m) — tight enough that two different addresses won't
    // collide but loose enough that a re-typed search result picks
    // up the same Nominatim coords as a previous save.
    const round4 = (n: number) => Math.round(n * 10000) / 10000
    const targetLat = round4(coords.lat)
    const targetLng = round4(coords.lng)
    const existing = myLocations.find((loc) => {
      if (!loc.coords) return false
      return (
        round4(loc.coords.lat) === targetLat &&
        round4(loc.coords.lng) === targetLng
      )
    })
    if (existing) {
      setReusedExistingName(existing.name)
      // Surface the banner for ~1.4s so the user can read it before
      // the dialog closes via onPick.
      setIsSaving(true)
      setSaveError(null)
      window.setTimeout(() => onPick(existing), 1400)
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const ref = await putLocationRecord(
        ownDid,
        targetDid,
        coords,
        name.trim() || null,
      )
      onPick({ ref, name: name.trim() || `${coords.lat}, ${coords.lng}` })
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save location",
      )
      setIsSaving(false)
    }
  }

  const handleSubmitExisting = () => {
    const chosen = myLocations.find(
      (loc) => loc.ref.uri === selectedExistingUri,
    )
    if (!chosen) return
    onPick(chosen)
  }

  // The active pin depends on which tab is showing. "new" mode uses
  // the coords from the search-or-click flow; "existing" mode uses
  // the coords parsed from the picked record. Either way a single
  // point or no point at all — same shape the Map component expects.
  const selectedExistingLoc = myLocations.find(
    (l) => l.ref.uri === selectedExistingUri,
  )
  const activeCoords: LatLng | null =
    mode === "new" ? coords : (selectedExistingLoc?.coords ?? null)
  const hasPin = !!activeCoords
  const pins = hasPin ? [activeCoords as LatLng] : []
  const center: LatLng = hasPin
    ? (activeCoords as LatLng)
    : { lat: 20, lng: 0 }
  // Existing-tab selections zoom in to street-ish detail (13);
  // new-tab clicks keep a wider 6 so the user can keep clicking
  // nearby spots without the camera lurching closer each time.
  // Empty-state zoom is 2 (one level past full world) so the map
  // opens with a slightly less abstract view than zoom 1.
  const zoom = hasPin ? (mode === "existing" ? 13 : 6) : 2

  // Force the Leaflet `<MapContainer>` to remount whenever the
  // existing-tab selection changes — Leaflet only honours its
  // initial `center` / `zoom` props on mount, and our shared
  // MapDataEffect intentionally skips re-centering when a SINGLE
  // pin moves (it would otherwise lurch the camera every time a
  // user clicks-to-pin on the new tab). Re-mounting via the `key`
  // prop is the lightest way to get the "jump + zoom" behaviour
  // only for the existing-tab dropdown flow.
  const mapKey =
    mode === "existing" ? `existing-${selectedExistingUri || "empty"}` : "new"

  // Modal sizing — derived from the live viewport so the dialog
  // never overflows on small/medium screens but still respects a
  // floor on really tiny phones.
  //
  // Width: capped at 1100 (the same hero width the cert-detail
  // "view location" modal uses), but no wider than `viewport - 40`
  // so there's always at least a 20px gutter on each side. The
  // `Math.max(320, …)` clamps to a minimum of 320 so an ultra-
  // narrow viewport (<320px) still gets a usable form rather than
  // collapsing into nothing — content scrolls horizontally inside
  // the dialog in that edge case.
  //
  // Map height: viewport height minus the non-map chrome the
  // dialog also carries (header, tabs, field row, hint, action
  // row, paddings ~= 280px) — capped at 720 on tall monitors,
  // floored at 220 so the map doesn't shrink to a sliver.
  const NON_MAP_CHROME = 280
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : 800
  const modalMaxWidth = Math.max(320, Math.min(1100, viewportWidth - 40))
  const mapHeight = Math.max(
    220,
    Math.min(720, viewportHeight - 40 - NON_MAP_CHROME),
  )

  return (
    <AppDialog
      ariaLabel="Add location"
      className="create-cert__loc-dialog"
      /* Capped at 1100 to share a hero width with the "view
         location" modal on the cert detail page, but clamped to
         the live viewport (with a 20px gutter on each side) so
         the dialog never overflows on smaller screens. The 320
         floor keeps a usable form on ultra-narrow viewports. */
      maxWidth={modalMaxWidth}
      onClose={onClose}
    >
      <AppDialogHeader title="Add location" onClose={onClose} />
      <div className="create-cert__loc-dialog-body">
        <div
          role="tablist"
          aria-label="Location source"
          className="create-cert__loc-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "existing"}
            className={
              mode === "existing"
                ? "create-cert__loc-tab create-cert__loc-tab--active"
                : "create-cert__loc-tab"
            }
            onClick={() => setMode("existing")}
          >
            My locations
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "new"}
            className={
              mode === "new"
                ? "create-cert__loc-tab create-cert__loc-tab--active"
                : "create-cert__loc-tab"
            }
            onClick={() => setMode("new")}
          >
            New
          </button>
        </div>

        {mode === "new" ? (
          <>
            <p className="create-cert__loc-hint">
              Type a place to search, or click anywhere on the map to
              drop a pin. After picking, you can rename the field to
              something more specific.
            </p>
            <div className="create-cert__loc-combobox">
              <input
                type="text"
                className="cert-detail__meta-input create-cert__field--full"
                value={name}
                maxLength={256}
                placeholder={
                  fieldMode === "edit"
                    ? "Rename to something more specific"
                    : "Search a city or address…"
                }
                aria-label={
                  fieldMode === "edit"
                    ? "Location name"
                    : "Search a location"
                }
                role="combobox"
                aria-expanded={
                  fieldMode === "search" &&
                  dropdownOpen &&
                  suggestions.length > 0
                }
                aria-autocomplete="list"
                aria-controls="create-cert-loc-suggestions"
                aria-activedescendant={
                  highlightIndex >= 0
                    ? `create-cert-loc-suggestion-${highlightIndex}`
                    : undefined
                }
                onChange={(e) => {
                  const next = e.target.value
                  setName(next)
                  if (next.trim().length === 0) {
                    // Empty field re-opens the search mode so the
                    // user can find a different place without an
                    // explicit "search again" affordance.
                    setFieldMode("search")
                  }
                  if (fieldMode === "search") {
                    setDropdownOpen(true)
                  }
                }}
                onFocus={() => {
                  if (blurTimerRef.current) {
                    window.clearTimeout(blurTimerRef.current)
                    blurTimerRef.current = null
                  }
                  if (fieldMode === "search" && suggestions.length > 0) {
                    setDropdownOpen(true)
                  }
                }}
                onBlur={() => {
                  blurTimerRef.current = window.setTimeout(() => {
                    setDropdownOpen(false)
                  }, 150)
                }}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
              />
              {/* Inline search-again button — clicking re-enters
                  search mode using the current value as the query,
                  matching the Enter-key affordance. Lives only in
                  edit mode (in search mode the suggestion dropdown
                  is doing the same job). `onMouseDown` instead of
                  onClick so the focus-blur on the input doesn't
                  close the suggestions before this fires. */}
              {fieldMode === "edit" ? (
                <button
                  type="button"
                  className="create-cert__loc-search-again"
                  aria-label="Search for a different place"
                  title="Search again"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    triggerSearchAgain()
                  }}
                >
                  <Search size={14} strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              {fieldMode === "search" &&
              dropdownOpen &&
              suggestions.length > 0 ? (
                <ul
                  id="create-cert-loc-suggestions"
                  role="listbox"
                  className="create-cert__loc-suggestions"
                >
                  {suggestions.map((hit, i) => {
                    const isActive = i === highlightIndex
                    const [primary, ...rest] = hit.displayName.split(", ")
                    const secondary = rest.join(", ")
                    return (
                      <li
                        key={`${hit.lat}-${hit.lng}-${i}`}
                        id={`create-cert-loc-suggestion-${i}`}
                        role="option"
                        aria-selected={isActive}
                        className={
                          isActive
                            ? "create-cert__loc-suggestion create-cert__loc-suggestion--active"
                            : "create-cert__loc-suggestion"
                        }
                        onMouseEnter={() => setHighlightIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSuggestion(hit)
                        }}
                      >
                        <span className="create-cert__loc-suggestion-primary">
                          {primary}
                        </span>
                        {secondary ? (
                          <span className="create-cert__loc-suggestion-secondary">
                            {secondary}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
            <div className="create-cert__loc-map">
              <Map
                key={mapKey}
                pins={pins}
                center={center}
                zoom={zoom}
                height={mapHeight}
                onMapClick={handleMapClick}
              />
            </div>
            <p className="create-cert__loc-hint">
              {busy === "forward"
                ? "Searching…"
                : busy === "reverse"
                  ? "Resolving pin…"
                  : coords
                    ? `Pinned at ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                    : "Search above or click the map to drop a pin"}
            </p>
          </>
        ) : (
          <>
            <label
              htmlFor="create-cert-loc-existing"
              className="create-cert__loc-uri-label"
            >
              Pick one of the locations you&apos;ve already published:
            </label>
            {myLocationsLoading ? (
              <p className="create-cert__loc-hint">Loading…</p>
            ) : myLocationsError ? (
              <p className="cert-detail__error-desc" role="alert">
                {myLocationsError}
              </p>
            ) : myLocations.length === 0 ? (
              <p className="create-cert__loc-hint">
                You haven&apos;t published any locations yet. Add one
                via the New tab and it will appear here on the next cert.
              </p>
            ) : (
              <>
                <select
                  id="create-cert-loc-existing"
                  className="cert-detail__meta-input create-cert__field--full"
                  value={selectedExistingUri}
                  onChange={(e) => setSelectedExistingUri(e.target.value)}
                >
                  <option value="">Select a location…</option>
                  {myLocations.map((loc) => (
                    <option key={loc.ref.uri} value={loc.ref.uri}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <div className="create-cert__loc-map">
                  <Map
                    key={mapKey}
                    pins={pins}
                    center={center}
                    zoom={zoom}
                    height={mapHeight}
                  />
                </div>
                <p className="create-cert__loc-hint">
                  {selectedExistingLoc
                    ? selectedExistingLoc.coords
                      ? `${selectedExistingLoc.name} — ${selectedExistingLoc.coords.lat.toFixed(4)}, ${selectedExistingLoc.coords.lng.toFixed(4)}`
                      : `${selectedExistingLoc.name} — no pinnable coordinates`
                    : "Pick a location above to see it on the map"}
                </p>
              </>
            )}
          </>
        )}

        {reusedExistingName ? (
          <p className="create-cert__loc-reused" role="status">
            Already in My locations — using your existing record:{" "}
            <strong>{reusedExistingName}</strong>.
          </p>
        ) : null}
        {saveError ? (
          <p className="cert-detail__error-desc" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="create-cert__loc-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          {mode === "new" ? (
            <Button
              type="button"
              variant="primary"
              disabled={!canSubmitNew}
              loading={isSaving}
              onClick={handleSubmitNew}
            >
              {isSaving ? "Saving…" : "Add"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={!canSubmitExisting}
              loading={isSaving}
              onClick={handleSubmitExisting}
            >
              {isSaving ? "Resolving…" : "Add"}
            </Button>
          )}
        </div>
        {isSaving ? <LoadingSpinner size="sm" /> : null}
      </div>
    </AppDialog>
  )
}
