"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, MapPin, Plus, Target, Trash2, Users } from "lucide-react"
import Image from "next/image"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import { FolderGit2 } from "lucide-react"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import type { HypercertsLargeImage } from "@/lib/atproto/types"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { usePageTitle } from "@/lib/navbar-context"
import {
  ContributorIdentityField,
  isContributorIdentityAcceptable,
  isContributorWeightAcceptable,
  normalizeIdentity,
} from "@/components/create/contributor-identity-field"

/**
 * `/project/new` — new project. Mirrors the visual language of the
 * project detail page (full-width banner + title + meta strip +
 * description editor) and reuses the building blocks of /create:
 * `ImageEditOverlay`, `LeafletEditor`, `ContributorIdentityField`,
 * the grapheme-counting min/max validation pattern, and the
 * required-fields gating on canSubmit.
 *
 * Wire format: `org.hypercerts.collection` record with
 * `type: "project"`. Editable fields surfaced here:
 *   Required:
 *     - title             (string, max 800 — lexicon cap)
 *     - shortDescription  (string, max 300 graphemes)
 *     - createdAt         (auto-stamped at submit)
 *   Optional:
 *     - description       (Leaflet LinearDocument)
 *     - banner            (org.hypercerts.defs#largeImage)
 *     - startDate / endDate (ISO datetime; date input emits YYYY-MM-DD)
 *     - location          (single string — not a strongRef)
 *     - contributors[]    (inline contributorIdentity rows w/ weight + role)
 *
 *   Deferred to post-create on the detail page:
 *     - items[]           (certs that belong to the project; the
 *                          project detail page has its own picker)
 */

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/

interface ContributorRow {
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

export default function CreateProjectPage() {
  usePageTitle("New project")
  const { isAuthenticated, isLoading, did } = useAuth()
  const { activeOrg } = useOrg()
  const router = useRouter()
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

  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [contributors, setContributors] = useState<ContributorRow[]>([])

  const [pendingBannerBlob, setPendingBannerBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingBannerPreviewUrl, setPendingBannerPreviewUrl] =
    useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (pendingBannerPreviewUrl) URL.revokeObjectURL(pendingBannerPreviewUrl)
    }
  }, [pendingBannerPreviewUrl])

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
  const TITLE_MAX = 800
  const SHORT_DESC_MIN = 100
  const SHORT_DESC_MAX = 300

  useEffect(() => {
    setError(null)
  }, [
    title,
    shortDescription,
    startDate,
    endDate,
    location,
    description,
    contributors,
    pendingBannerBlob,
  ])

  const handleBannerFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingBannerPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      const targetDid = activeOrg ? activeOrg.groupDid : null
      const blob = await uploadBlob(
        file,
        targetDid ? { targetDid } : undefined,
      )
      setPendingBannerBlob(blob)
    },
    [activeOrg],
  )

  const handleBannerRemove = useCallback(() => {
    setPendingBannerBlob(null)
    setPendingBannerPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

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
              icon={FolderGit2}
              title="Sign in to create"
              description="You need to be signed in to create a project."
            />
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!did) return
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

    type ProjectRecord = {
      $type: "org.hypercerts.collection"
      type: "project"
      title: string
      shortDescription: string
      createdAt: string
      description?: LinearDocument
      banner?: HypercertsLargeImage
      startDate?: string
      endDate?: string
      location?: string
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
      items?: Array<{ itemIdentifier: { uri: string; cid: string } }>
    }
    const record: ProjectRecord = {
      $type: "org.hypercerts.collection",
      type: "project",
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      createdAt: new Date().toISOString(),
      // Empty items array — the project detail page's cert picker
      // adds entries after creation.
      items: [],
    }
    if (description && description.blocks.length > 0) {
      record.description = description
    }
    if (pendingBannerBlob) {
      record.banner = {
        $type: "org.hypercerts.defs#largeImage",
        image: pendingBannerBlob as unknown as BlobRef,
      }
    }
    if (startDate) {
      record.startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString()
    }
    if (endDate) {
      record.endDate = new Date(`${endDate}T00:00:00.000Z`).toISOString()
    }
    if (location.trim()) {
      record.location = location.trim()
    }
    const seenIds = new Set<string>()
    const populatedContributors: NonNullable<ProjectRecord["contributors"]> = []
    for (const c of contributors) {
      const norm = normalizeIdentity(c.identity)
      if (!norm) continue
      const key = norm.toLowerCase()
      if (seenIds.has(key)) continue
      seenIds.add(key)
      const entry: NonNullable<ProjectRecord["contributors"]>[number] = {
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity",
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

    try {
      // Project creation currently only goes through the user's own
      // repo. Group-owned projects are written via the existing
      // /api/groups/[groupDid]/project route, which is update-only;
      // a create path can be added there mirroring the activity
      // route, but for now active-group context falls back to the
      // signed-in user's repo for new projects.
      const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: did,
          collection: "org.hypercerts.collection",
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
          `/project/${encodeURIComponent(ownerDid)}/${encodeURIComponent(rkey)}`,
        )
      } else {
        router.push("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsSubmitting(false)
    }
  }

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
  const canSubmit =
    trimmedTitleCount >= TITLE_MIN &&
    titleCount <= TITLE_MAX &&
    trimmedShortDescCount >= SHORT_DESC_MIN &&
    shortDescCount <= SHORT_DESC_MAX &&
    allContributorsValid &&
    duplicateIdentitySet.size === 0 &&
    !isSubmitting

  return (
    <form onSubmit={handleSubmit}>
      <article className="page-layout project-detail--wide create-project">
        <div className="page-layout__main">
          {/* Banner / hero image at the top — same aspect ratios as
              project-detail's hero (16/9 on narrow, 21/9 wide). The
              dashed-outline `--editing` modifier carries the same
              affordance the cert image slot uses. */}
          <div
            className={
              pendingBannerPreviewUrl
                ? "project-detail__hero create-project__hero"
                : "project-detail__hero project-detail__hero--placeholder create-project__hero"
            }
          >
            {pendingBannerPreviewUrl ? (
              <Image
                src={pendingBannerPreviewUrl}
                alt=""
                fill
                className="project-detail__hero-img"
                unoptimized
              />
            ) : (
              <FolderGit2
                size={56}
                strokeWidth={1.25}
                aria-hidden
                className="project-detail__hero-placeholder-icon"
              />
            )}
            <ImageEditOverlay
              onFile={handleBannerFile}
              hasPending={!!pendingBannerBlob}
              variant="with-remove"
              onRemove={handleBannerRemove}
              hasImage={!!pendingBannerBlob}
            />
          </div>

          <header className="cert-detail__headline">
            <div className="create-cert__input-with-counter">
              <input
                type="text"
                className="cert-detail__title-input"
                aria-label="Title"
                placeholder="Title for your project"
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

          {/* Meta strip — Time period, Location, Contributors — sits
              between the lead and the long description, matching the
              meta layout on the project detail page. */}
          <section className="project-detail__meta create-project__meta">
            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">
                <Calendar size={11} strokeWidth={2} aria-hidden /> Time period
              </span>
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
            </div>

            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">
                <MapPin size={11} strokeWidth={2} aria-hidden /> Location
              </span>
              <input
                type="text"
                className="cert-detail__meta-input create-cert__field--full"
                aria-label="Location"
                placeholder="e.g. Remote, Berlin, Amazon Basin…"
                value={location}
                maxLength={256}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="project-detail__meta-row project-detail__meta-row--wide">
              <span className="project-detail__meta-label">
                <Target size={11} strokeWidth={2} aria-hidden /> Long
                description
              </span>
              <div className="project-detail__prose">
                <LeafletEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Full description of this project. Headings, lists, links, images, and video embeds are all supported via the toolbar."
                  ariaLabel="Project description"
                  did={did ?? ""}
                  onImageUpload={(file) =>
                    uploadBlob(
                      file,
                      activeOrg
                        ? { targetDid: activeOrg.groupDid }
                        : undefined,
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">
                <Users
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                  style={{ marginRight: 6, verticalAlign: "-2px" }}
                />
                Contributors
              </h2>
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
                        <p className="create-cert__contrib-error" role="alert">
                          Use a DID (did:plc:…) or a handle (alice.bsky.social).
                        </p>
                      ) : identityDuplicate ? (
                        <p className="create-cert__contrib-error" role="alert">
                          Already added — each contributor can only appear once.
                        </p>
                      ) : !weightValid ? (
                        <p className="create-cert__contrib-error" role="alert">
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

          <p className="create-cert__followup-note">
            You&apos;ll be able to attach certs to this project from
            the project page after you create it.
          </p>

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
              {isSubmitting ? "Publishing…" : "Publish project"}
            </Button>
          </div>
        </div>
      </article>
    </form>
  )
}
