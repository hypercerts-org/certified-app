"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { MapPin, Plus, X, FolderGit2 } from "lucide-react"
import Image from "next/image"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import type { HypercertsLargeImage } from "@/lib/atproto/types"
import { usePageTitle } from "@/lib/navbar-context"
import { countGraphemes } from "@/lib/utils/graphemes"
import { useOwnCerts } from "@/hooks/use-own-certs"
import LocationPickerDialog, {
  type AddedLocation,
} from "@/components/create/location-picker-dialog"

/**
 * `/project/new` — new project. Mirrors the visual language of the
 * project detail page (`.project-detail--wide` + `.project-detail`
 * column) and reuses the form-field building blocks of /create:
 * `ImageEditOverlay`, `LeafletEditor`, the grapheme-counting
 * counter pattern.
 *
 * Wire format: `org.hypercerts.collection` record with
 * `type: "project"`. Field set tracks the lexicon at
 * `org.hypercerts.collection` exactly — no contributors / dates /
 * inline-string location (those exist on the activity record, not
 * the collection record).
 *
 *   Required:
 *     - title         (string, max 80 graphemes / 800 bytes)
 *     - createdAt     (auto-stamped at submit)
 *   Optional:
 *     - shortDescription  (string, max 300 graphemes)
 *     - description       (Leaflet LinearDocument)
 *     - banner            (org.hypercerts.defs#largeImage)
 *     - items[]           (strongRefs to certs to include — added
 *                          via the CertSearch typeahead below)
 *     - location          (strongRef — deferred to the project
 *                          detail page's own location editor)
 *     - avatar            (deferred; banner covers the hero slot)
 */

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/

interface SelectedCert {
  uri: string
  cid: string
  title: string
}

export default function CreateProjectPage() {
  usePageTitle("New project")
  const { isAuthenticated, isLoading, did } = useAuth()
  const { activeOrg } = useOrg()
  const router = useRouter()

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
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [items, setItems] = useState<SelectedCert[]>([])
  // Collections only carry ONE location (a single strongRef per the
  // lexicon). The host stores a single picked value; the shared
  // dialog still returns one entry per pick — we just replace
  // instead of pushing.
  const [location, setLocation] = useState<AddedLocation | null>(null)
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)

  // "Your certs" quick-pick. Fetched on mount via listRecords on the
  // active repo (own DID or active group's DID) so the author can
  // toggle entries straight from a checklist without first typing
  // into the CertSearch typeahead. The typeahead stays below for
  // finding certs that aren't theirs.
  const { ownCerts, isLoading: ownCertsLoading } = useOwnCerts(did)

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

  const titleCount = countGraphemes(title)
  const shortDescCount = countGraphemes(shortDescription)
  // Lexicon caps from `org.hypercerts.collection`:
  //   title.maxGraphemes = 80 (maxLength 800)
  //   shortDescription.maxGraphemes = 300
  // shortDescription is optional in the lexicon; the create form
  // surfaces a min as a soft product floor so brand-new projects
  // ship with at least a sentence of context.
  const TITLE_MIN = 5
  const TITLE_MAX = 80
  const SHORT_DESC_MAX = 300

  useEffect(() => {
    setError(null)
  }, [
    title,
    shortDescription,
    description,
    items,
    location,
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
      try {
        const blob = await uploadBlob(
          file,
          targetDid ? { targetDid } : undefined,
        )
        setPendingBannerBlob(blob)
      } catch (err) {
        // Surface the failure and clear the dangling optimistic preview
        // so the form can't be published with a banner that never
        // uploaded.
        setError(
          err instanceof Error ? err.message : "Image upload failed",
        )
        setPendingBannerBlob(null)
        setPendingBannerPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
      }
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
    if (trimT < TITLE_MIN) return
    if (titleCount > TITLE_MAX) return
    if (shortDescCount > SHORT_DESC_MAX) return

    setIsSubmitting(true)
    setError(null)

    type ProjectRecord = {
      $type: "org.hypercerts.collection"
      type: "project"
      title: string
      createdAt: string
      shortDescription?: string
      description?: LinearDocument
      banner?: HypercertsLargeImage
      items?: Array<{ itemIdentifier: { uri: string; cid: string } }>
      location?: { uri: string; cid: string }
    }
    const record: ProjectRecord = {
      $type: "org.hypercerts.collection",
      type: "project",
      title: title.trim(),
      createdAt: new Date().toISOString(),
    }
    if (shortDescription.trim()) {
      record.shortDescription = shortDescription.trim()
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
    if (items.length > 0) {
      record.items = items.map((c) => ({
        itemIdentifier: { uri: c.uri, cid: c.cid },
      }))
    }
    if (location) {
      record.location = { uri: location.ref.uri, cid: location.ref.cid }
    }

    try {
      // Group-active → group BFF (PUT with no rkey → createRecord
      // on the group's repo). Personal → xrpc proxy. The two
      // routes return the same `{ uri, cid }` shape so the
      // redirect logic below doesn't care which path was used.
      const targetDid = activeOrg ? activeOrg.groupDid : did
      const useGroupRoute = activeOrg !== null
      const url = useGroupRoute
        ? `/api/groups/${encodeURIComponent(targetDid)}/project`
        : "/api/xrpc/com/atproto/repo/createRecord"
      const method = useGroupRoute ? "PUT" : "POST"
      const body = useGroupRoute
        ? { record }
        : {
            repo: targetDid,
            collection: "org.hypercerts.collection",
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
  const titleUnder = trimmedTitleCount > 0 && trimmedTitleCount < TITLE_MIN
  const titleOver = titleCount > TITLE_MAX
  const shortDescOver = shortDescCount > SHORT_DESC_MAX
  const canSubmit =
    trimmedTitleCount >= TITLE_MIN &&
    titleCount <= TITLE_MAX &&
    shortDescCount <= SHORT_DESC_MAX &&
    !isSubmitting

  return (
    <form onSubmit={handleSubmit}>
      <article className="project-detail-page project-detail--wide create-project">
        <div className="project-detail">
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
                maxLength={TITLE_MAX * 4}
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
                  shortDescOver ? " create-cert__counter--over" : ""
                }`}
                aria-live="polite"
              >
                {shortDescCount}/{SHORT_DESC_MAX}
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
              placeholder="Full description of this project. Headings, lists, links, images, and video embeds are all supported via the toolbar."
              ariaLabel="Project description"
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
              <h2 className="cert-detail__section-title">Location</h2>
            </div>
            {location ? (
              <ul className="create-project__cert-list">
                <li className="create-project__cert-row">
                  <MapPin
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ flexShrink: 0, color: "var(--fg-muted)" }}
                  />
                  <span className="create-project__cert-title">
                    {location.name}
                  </span>
                  <button
                    type="button"
                    className="create-project__cert-remove"
                    aria-label={`Remove ${location.name}`}
                    onClick={() => setLocation(null)}
                  >
                    <X size={14} strokeWidth={2} aria-hidden />
                  </button>
                </li>
              </ul>
            ) : null}
            <div className="create-cert__contrib-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsLocationDialogOpen(true)}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                {location ? "Change location" : "Add location"}
              </Button>
            </div>
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Activities</h2>
              {items.length > 0 ? (
                <span className="cert-detail__section-count">
                  {items.length}
                </span>
              ) : null}
            </div>

            {items.length > 0 ? (
              <ul className="create-project__cert-list">
                {items.map((c) => (
                  <li key={c.uri} className="create-project__cert-row">
                    <span className="create-project__cert-title">
                      {c.title || c.uri}
                    </span>
                    <button
                      type="button"
                      className="create-project__cert-remove"
                      aria-label={`Remove ${c.title || c.uri}`}
                      onClick={() =>
                        setItems((rows) =>
                          rows.filter((r) => r.uri !== c.uri),
                        )
                      }
                    >
                      <X size={14} strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* "Your certs" quick-pick — a toggleable checklist of
                the certs the author has already published. Clicking
                a row adds/removes the strongRef from the project's
                items[] without typing anything. Hidden when the
                user has no certs OR the active group has none. */}
            {ownCertsLoading ? (
              <p className="cert-detail__empty-line">Loading your activities…</p>
            ) : ownCerts.length === 0 ? (
              <p className="cert-detail__empty-line">
                You don&rsquo;t have any activities yet.{" "}
                <Link href="/create" className="create-project__inline-link">
                  Create your first activity
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="create-project__quick-pick-label">
                  Add your activities:
                </p>
                <ul className="create-project__quick-pick-list">
                  {ownCerts.map((c) => {
                    const isAdded = items.some((r) => r.uri === c.uri)
                    return (
                      <li
                        key={c.uri}
                        className={
                          isAdded
                            ? "create-project__quick-pick-row create-project__quick-pick-row--added"
                            : "create-project__quick-pick-row"
                        }
                      >
                        <label className="create-project__quick-pick-label-inner">
                          <input
                            type="checkbox"
                            checked={isAdded}
                            onChange={() => {
                              if (isAdded) {
                                setItems((rows) =>
                                  rows.filter((r) => r.uri !== c.uri),
                                )
                              } else {
                                setItems((rows) => [...rows, c])
                              }
                            }}
                          />
                          <span className="create-project__quick-pick-title">
                            {c.title}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            {/* The "search for any cert" affordance is intentionally
                gone for now — the quick-pick checklist above covers
                the author's own certs, which is the only flow we
                want for v1 of /project/new. The full search will
                come back once we decide how to handle adding
                someone else's cert to a project. */}
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
              {isSubmitting ? "Publishing…" : "Publish project"}
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
            // Projects carry a single location — replace, don't push.
            setLocation(added)
            setIsLocationDialogOpen(false)
          }}
        />
      ) : null}
    </form>
  )
}
