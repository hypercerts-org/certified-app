"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Calendar,
  FileText,
  MapPin,
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
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import LoadingSpinner from "@/components/ui/loading-spinner"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import Map from "@/components/map/map-dynamic"
import { PenLine, Building2 } from "lucide-react"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import {
  putLocationRecord,
  readLocationStrongRef,
  type StrongRef,
} from "@/lib/atproto/location"
import {
  reverseGeocode,
  suggestForwardGeocode,
  type ForwardGeocodeResult,
} from "@/lib/locations/geocode"

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
  const { isAuthenticated, did } = useAuth()
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
  // never overestimates).
  const shortDescGraphemes = useCallback((s: string): number => {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
      let count = 0
      for (const _ of seg.segment(s)) count++
      return count
    }
    return Array.from(s).length
  }, [])
  const shortDescCount = shortDescGraphemes(shortDescription)
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
    const blob = await uploadBlob(file)
    setPendingImageBlob(blob)
  }, [])

  const handleImageRemove = useCallback(() => {
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

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

  // Group context isn't supported yet — same constraint as before:
  // the xrpc proxy validates repo === session DID for write methods.
  if (activeOrg) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={Building2}
              title="Switch to your personal account"
              description="Creating activity claims as a group isn't supported yet. Use the account switcher to switch to your personal identity."
            />
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !shortDescription.trim() || !did) return
    if (shortDescCount > SHORT_DESC_MAX) return

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
    const populatedContributors = contributors
      .filter((c) => c.identity.trim().length > 0)
      .map((c) => {
        const entry: NonNullable<ClaimActivityRecord["contributors"]>[number] = {
          contributorIdentity: {
            $type: "org.hypercerts.claim.activity#contributorIdentity",
            identity: c.identity.trim(),
          },
        }
        if (c.weight.trim()) entry.contributionWeight = c.weight.trim()
        if (c.role.trim()) {
          entry.contributionDetails = {
            $type: "org.hypercerts.claim.activity#contributorRole",
            role: c.role.trim(),
          }
        }
        return entry
      })
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
      const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: did,
          collection: "org.hypercerts.claim.activity",
          record,
        }),
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

  const canSubmit =
    title.trim().length > 0 &&
    shortDescription.trim().length > 0 &&
    shortDescCount <= SHORT_DESC_MAX &&
    !isSubmitting

  const overLimit = shortDescCount > SHORT_DESC_MAX

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
            <input
              type="text"
              className="cert-detail__title-input"
              aria-label="Title (required)"
              placeholder="Title for your cert *"
              value={title}
              maxLength={256}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </header>

          <section className="cert-detail__section">
            <textarea
              className="cert-detail__short-desc-input"
              value={shortDescription}
              placeholder="A short description (one or two lines) *"
              aria-label="Short description (required)"
              onChange={(e) => setShortDescription(e.target.value)}
              rows={3}
              required
            />
            <p
              className={`create-cert__counter${
                overLimit ? " create-cert__counter--over" : ""
              }`}
              aria-live="polite"
            >
              {shortDescCount}/{SHORT_DESC_MAX}
            </p>
            <p className="create-cert__required-hint">
              <span aria-hidden>*</span> Required
            </p>
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Description</h2>
            </div>
            <LeafletEditor
              value={description}
              onChange={setDescription}
              placeholder="Full description of this cert. Markdown-style headings, lists, and links are supported."
              ariaLabel="Cert description"
              did={did ?? ""}
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
                {contributors.map((c, idx) => (
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
                      className="cert-detail__meta-input create-cert__contrib-weight"
                      aria-label={`Contributor ${idx + 1} relative weight (optional)`}
                      placeholder="Relative weight (optional)"
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
                  </li>
                ))}
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
                  const alreadyAdded = contributors.some(
                    (c) => c.identity.trim() === selfIdentity,
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
// Contributor identity field — compact typeahead
//
// Reuses the same `/api/search-actors` endpoint that powers the
// HandleSearch component used in groups / endorsements. The visual
// shell is `cert-detail__meta-input` so the field sits flush in the
// contributor row alongside the role + weight inputs (HandleSearch
// itself ships with a 40px tall bordered-bottom input that would
// dwarf the other fields).
//
// Behaviour:
//   - The input value IS the contributor identity that will be
//     written to the record. Free-text edits flow straight to the
//     parent via `onChange`.
//   - When the value is non-empty and doesn't look like a complete
//     DID, a debounced search hits /api/search-actors and shows a
//     dropdown of matches. Picking a match replaces the input value
//     with `@handle` (or the DID if no handle resolved).
//   - Looks-like-a-DID values short-circuit the search — the user
//     is typing a canonical identifier and likely doesn't want
//     suggestions clobbering it.
// ----------------------------------------------------------------------

interface Actor {
  did: string
  handle: string
  displayName: string
  avatar: string | null
}

interface ContributorIdentityFieldProps {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  idx: number
}

function ContributorIdentityField({
  value,
  onChange,
  ariaLabel,
  idx,
}: ContributorIdentityFieldProps) {
  const [results, setResults] = useState<Actor[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the last value the user picked from the dropdown so a
  // re-render of the parent (which re-passes the value prop back
  // through) doesn't immediately re-fire the search effect against
  // the same string we just selected.
  const lastSelectedRef = useRef<string>("")

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    if (trimmed === lastSelectedRef.current) {
      // The current value is what we just inserted from the dropdown
      // — don't re-search and don't reopen the popup.
      return
    }
    // Suppress search for canonical DIDs — the user is typing or
    // pasting an identifier that doesn't need autocomplete.
    if (trimmed.startsWith("did:")) {
      setResults([])
      setIsOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/search-actors?q=${encodeURIComponent(trimmed)}&limit=8`,
          { headers: { Accept: "application/json" } },
        )
        if (res.ok) {
          const data = (await res.json()) as { actors?: Actor[] }
          const actors = data.actors ?? []
          setResults(actors)
          setIsOpen(actors.length > 0)
        } else {
          setResults([])
          setIsOpen(false)
        }
      } catch {
        // Silently — search is best-effort, the free-text input is
        // always functional as a fallback.
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen])

  const handleSelect = (actor: Actor) => {
    // Prefer the human-readable handle; fall back to the DID when
    // the upstream record has no handle attached.
    const picked =
      actor.handle && actor.handle !== actor.did
        ? `@${actor.handle}`
        : actor.did
    lastSelectedRef.current = picked
    onChange(picked)
    setIsOpen(false)
    setResults([])
    setFocusedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen || results.length === 0) return
      setFocusedIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!isOpen || results.length === 0) return
      setFocusedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setFocusedIndex(-1)
    } else if (e.key === "Enter") {
      if (focusedIndex >= 0 && focusedIndex < results.length) {
        e.preventDefault()
        handleSelect(results[focusedIndex])
      } else if (results.length === 1) {
        e.preventDefault()
        handleSelect(results[0])
      }
    }
  }

  return (
    <div className="create-cert__contrib-id" ref={containerRef}>
      <input
        type="text"
        className="cert-detail__meta-input"
        aria-label={ariaLabel}
        placeholder="@handle or did:plc:…"
        value={value}
        maxLength={1000}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`create-cert-contrib-listbox-${idx}`}
        aria-autocomplete="list"
        aria-activedescendant={
          focusedIndex >= 0
            ? `create-cert-contrib-opt-${idx}-${focusedIndex}`
            : undefined
        }
        onChange={(e) => {
          // Once the user edits past the selected value, allow
          // future searches again.
          if (e.target.value !== lastSelectedRef.current) {
            lastSelectedRef.current = ""
          }
          onChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true)
        }}
      />
      {isSearching ? (
        <span className="create-cert__contrib-id-spinner" aria-hidden />
      ) : null}
      {isOpen && results.length > 0 ? (
        <ul
          id={`create-cert-contrib-listbox-${idx}`}
          role="listbox"
          className="create-cert__contrib-id-dropdown"
        >
          {results.map((actor, i) => {
            const isActive = i === focusedIndex
            return (
              <li
                key={actor.did}
                id={`create-cert-contrib-opt-${idx}-${i}`}
                role="option"
                aria-selected={isActive}
                className={
                  isActive
                    ? "create-cert__contrib-id-option create-cert__contrib-id-option--active"
                    : "create-cert__contrib-id-option"
                }
                onMouseEnter={() => setFocusedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(actor)
                }}
              >
                <span className="create-cert__contrib-id-name">
                  {actor.displayName || actor.handle}
                </span>
                <span className="create-cert__contrib-id-handle">
                  {actor.handle !== actor.did
                    ? `@${actor.handle}`
                    : actor.did}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
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
  ownDid: string
  onClose: () => void
  onPick: (added: AddedLocation) => void
}

function LocationPickerDialog({
  ownDid,
  onClose,
  onPick,
}: LocationPickerDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("new")

  // ----- New-record fields -----
  const [name, setName] = useState("")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [suggestions, setSuggestions] = useState<ForwardGeocodeResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [busy, setBusy] = useState<"idle" | "forward" | "reverse">("idle")
  const lastSourceRef = useRef<"user" | "map" | null>(null)
  const blurTimerRef = useRef<number | null>(null)

  // ----- Existing-record field -----
  const [uri, setUri] = useState("")

  // ----- Submit state -----
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Forward-geocode autocomplete — same shape as the profile picker.
  // The 350ms debounce keeps Nominatim out of trouble; the
  // `lastSourceRef === "map"` early-out prevents the reverse-geocode
  // result (set programmatically by the map click handler) from
  // immediately triggering another forward search.
  useEffect(() => {
    if (mode !== "new") return
    if (lastSourceRef.current === "map") {
      lastSourceRef.current = null
      setSuggestions([])
      return
    }
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
  }, [name, mode])

  const pickSuggestion = (hit: ForwardGeocodeResult) => {
    lastSourceRef.current = "map"
    setName(hit.displayName)
    setCoords({ lat: hit.lat, lng: hit.lng })
    setDropdownOpen(false)
    setSuggestions([])
    setHighlightIndex(-1)
  }

  const handleMapClick = async (latlng: { lat: number; lng: number }) => {
    setCoords(latlng)
    lastSourceRef.current = "map"
    setBusy("reverse")
    setDropdownOpen(false)
    const hit = await reverseGeocode(latlng.lat, latlng.lng)
    setBusy("idle")
    if (hit?.displayName) setName(hit.displayName)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    } else if (e.key === "Enter") {
      const pick = suggestions[highlightIndex] ?? suggestions[0]
      if (pick) {
        e.preventDefault()
        pickSuggestion(pick)
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false)
      e.preventDefault()
    }
  }

  const canSubmitNew = !!coords && !isSaving
  const canSubmitExisting = uri.trim().startsWith("at://") && !isSaving

  const handleSubmitNew = async () => {
    if (!coords) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const ref = await putLocationRecord(
        ownDid,
        ownDid,
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

  const handleSubmitExisting = async () => {
    const trimmed = uri.trim()
    if (!trimmed.startsWith("at://")) return
    setIsSaving(true)
    setSaveError(null)
    try {
      // readLocationStrongRef only consults the URI on the input —
      // pass an empty cid placeholder, it'll be replaced with the
      // real cid from the fetch response.
      const resolved = await readLocationStrongRef({
        uri: trimmed,
        cid: "",
      })
      if (!resolved) {
        throw new Error(
          "Couldn't resolve that record — check the URI points at an app.certified.location",
        )
      }
      onPick({
        ref: { uri: resolved.uri, cid: resolved.cid },
        name:
          resolved.name ??
          `${resolved.coords.lat}, ${resolved.coords.lng}`,
      })
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to resolve location URI",
      )
      setIsSaving(false)
    }
  }

  const hasPin = !!coords
  const pins = hasPin ? [coords as { lat: number; lng: number }] : []
  const center = hasPin ? (coords as { lat: number; lng: number }) : {
    lat: 20,
    lng: 0,
  }
  const zoom = hasPin ? 6 : 1

  return (
    <AppDialog
      ariaLabel="Add location"
      className="create-cert__loc-dialog"
      maxWidth={620}
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
            Existing URI
          </button>
        </div>

        {mode === "new" ? (
          <>
            <div className="create-cert__loc-combobox">
              <input
                type="text"
                className="cert-detail__meta-input"
                value={name}
                maxLength={256}
                placeholder="Type a city or address…"
                aria-label="Location name"
                role="combobox"
                aria-expanded={dropdownOpen && suggestions.length > 0}
                aria-autocomplete="list"
                aria-controls="create-cert-loc-suggestions"
                aria-activedescendant={
                  highlightIndex >= 0
                    ? `create-cert-loc-suggestion-${highlightIndex}`
                    : undefined
                }
                onChange={(e) => {
                  lastSourceRef.current = "user"
                  setDropdownOpen(true)
                  setName(e.target.value)
                }}
                onFocus={() => {
                  if (blurTimerRef.current) {
                    window.clearTimeout(blurTimerRef.current)
                    blurTimerRef.current = null
                  }
                  if (suggestions.length > 0) setDropdownOpen(true)
                }}
                onBlur={() => {
                  blurTimerRef.current = window.setTimeout(() => {
                    setDropdownOpen(false)
                  }, 150)
                }}
                onKeyDown={onInputKeyDown}
                autoComplete="off"
              />
              {dropdownOpen && suggestions.length > 0 ? (
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
                pins={pins}
                center={center}
                zoom={zoom}
                height={280}
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
              htmlFor="create-cert-loc-uri"
              className="create-cert__loc-uri-label"
            >
              Paste an at:// URI of an existing{" "}
              <code>app.certified.location</code> record:
            </label>
            <input
              id="create-cert-loc-uri"
              type="text"
              className="cert-detail__meta-input"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="at://did:plc:…/app.certified.location/…"
              autoComplete="off"
            />
          </>
        )}

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
