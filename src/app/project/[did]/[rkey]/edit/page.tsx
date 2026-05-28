"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { MapPin, Plus, X, FolderGit2 } from "lucide-react"
import Image from "next/image"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import EditBanner from "@/components/ui/edit-banner"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import { uploadBlob, type UploadedBlob } from "@/lib/atproto/profile"
import type { HypercertsLargeImage } from "@/lib/atproto/types"
import { usePageTitle } from "@/lib/navbar-context"
import LocationPickerDialog, {
  type AddedLocation,
} from "@/components/create/location-picker-dialog"
import { useProject } from "@/hooks/use-project"
import { useProjectItems } from "@/hooks/use-project-items"
import { putProjectRecord } from "@/lib/atproto/project"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { saveWithSwap } from "@/lib/atproto/save-with-swap"
import type { CollectionValue } from "@/lib/atproto/collection"
import { asLinearDocument, isEmptyLongDescription } from "@/lib/leaflet/guards"
import { splitLocationName } from "@/lib/atproto/location"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"

/**
 * `/project/[did]/[rkey]/edit` — full-page project editor. Mirrors
 * `/project/new`'s layout (banner hero + headline + sections), pre-
 * filled from the existing `org.hypercerts.collection` record. The
 * sticky `<EditBanner>` carries Save / Cancel; the in-form Cancel /
 * Publish action row is gone.
 *
 * Save routes through `putProjectRecord` with a `saveWithSwap` CID
 * precondition so a concurrent edit elsewhere surfaces as a conflict
 * rather than silently clobbering. Auth gate: signed-in + (own
 * project OR acting as the owning group with owner/admin role) —
 * matches the inline-edit gate on the read-mode project page.
 */

interface SelectedCert {
  uri: string
  cid: string
  title: string
}

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = AT_URI_RE.exec(uri)
  if (!m) return null
  return { did: m[1], collection: m[2], rkey: m[3] }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export default function ProjectEditPage() {
  usePageTitle("Edit project")
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

  const canEditAsActiveOrg =
    !!activeOrg &&
    !!did &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  const isOwner = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  const editTargetDid = canEditAsActiveOrg ? did : undefined

  const { project, isLoading: projectLoading, error: projectError } = useProject(
    did,
    rkey,
  )

  // -------------------------------------------------------------------
  // Form state — mirrors /project/new.
  // -------------------------------------------------------------------
  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [items, setItems] = useState<SelectedCert[]>([])
  const [location, setLocation] = useState<AddedLocation | null>(null)
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)

  // Banner: existing image renders by default; only on Replace do we
  // stage a new blob, only on Remove do we clear it.
  const [pendingBannerBlob, setPendingBannerBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingBannerPreviewUrl, setPendingBannerPreviewUrl] =
    useState<string | null>(null)
  const [bannerRemoved, setBannerRemoved] = useState(false)

  // Author's own certs — quick-pick list. Same fetch as /project/new.
  const [ownCerts, setOwnCerts] = useState<SelectedCert[]>([])
  const [ownCertsLoading, setOwnCertsLoading] = useState(true)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Captured at seed time — the swap-record baseline. */
  const [mountSnapshot, setMountSnapshot] = useState<{
    value: CollectionValue
    cid: string
  } | null>(null)
  const seededRef = useRef(false)

  // -------------------------------------------------------------------
  // Resolve project items (cert strongRefs → titles) so the prefilled
  // cert list renders with names rather than raw URIs.
  // -------------------------------------------------------------------
  const rawItems = useMemo(
    () => (project?.value.items as unknown[]) ?? [],
    [project?.value.items],
  )
  const { resolutions: itemResolutions, isLoading: itemsResolving } =
    useProjectItems(rawItems)

  // -------------------------------------------------------------------
  // Seed form fields from the loaded record. Runs once per mount; the
  // ref guard keeps a later re-render (e.g. items resolution settling)
  // from clobbering user edits.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (seededRef.current) return
    if (!project) return
    const v = project.value
    setTitle(asString(v.title))
    setShortDescription(asString(v.shortDescription))
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
    setMountSnapshot({ value: v, cid: project.cid })
    seededRef.current = true
  }, [project])

  // Hydrate items state from useProjectItems output once items have
  // resolved. Re-runs whenever the resolutions change — but only
  // until the user starts editing the list; we key off
  // `itemsSeededRef` to avoid stomping their changes.
  const itemsSeededRef = useRef(false)
  useEffect(() => {
    if (itemsSeededRef.current) return
    if (rawItems.length === 0) {
      itemsSeededRef.current = true
      return
    }
    if (itemsResolving) return
    const hydrated: SelectedCert[] = itemResolutions
      .filter((r) => r.record !== null)
      .map((r) => ({
        uri: r.record!.uri,
        cid: r.record!.cid,
        title:
          typeof r.record!.value.title === "string" && r.record!.value.title.trim()
            ? r.record!.value.title.trim()
            : r.record!.uri.split("/").pop() ?? "(untitled cert)",
      }))
    setItems(hydrated)
    itemsSeededRef.current = true
  }, [itemResolutions, itemsResolving, rawItems.length])

  // Hydrate the location (single strongRef → AddedLocation) so the
  // edit form shows the existing place name + lets the user clear
  // or replace it.
  useEffect(() => {
    if (!project) return
    const locRef = project.value.location as { uri?: string; cid?: string } | undefined
    if (!locRef?.uri || !locRef.cid) {
      setLocation(null)
      return
    }
    let aborted = false
    const parsed = parseAtUri(locRef.uri)
    if (!parsed) {
      setLocation({ ref: { uri: locRef.uri, cid: locRef.cid }, name: locRef.uri })
      return
    }
    const qs = new URLSearchParams({
      repo: parsed.did,
      collection: parsed.collection,
      rkey: parsed.rkey,
    })
    authFetch(`/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`)
      .then(async (res) => {
        if (aborted) return
        if (!res.ok) {
          setLocation({
            ref: { uri: locRef.uri!, cid: locRef.cid! },
            name: locRef.uri!.split("/").pop() ?? locRef.uri!,
          })
          return
        }
        const data = (await res.json()) as { value?: { name?: string } }
        const raw = data.value?.name?.trim() ?? ""
        const split = splitLocationName(raw)
        const name =
          split.name || raw || locRef.uri!.split("/").pop() || "Location"
        setLocation({ ref: { uri: locRef.uri!, cid: locRef.cid! }, name })
      })
      .catch(() => {
        if (aborted) return
        setLocation({
          ref: { uri: locRef.uri!, cid: locRef.cid! },
          name: locRef.uri!.split("/").pop() ?? locRef.uri!,
        })
      })
    return () => {
      aborted = true
    }
  }, [project])

  // Author's own certs (quick-pick checklist). Same fetch /project/new uses.
  useEffect(() => {
    const sourceDid = activeOrg ? activeOrg.groupDid : sessionDid
    if (!sourceDid) return
    const controller = new AbortController()
    setOwnCertsLoading(true)
    const qs = new URLSearchParams({
      repo: sourceDid,
      collection: "org.hypercerts.claim.activity",
      limit: "50",
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
            value?: { title?: unknown; createdAt?: unknown }
          }>
        }
        const records = (body.records ?? []).map((rec) => ({
          uri: rec.uri,
          cid: rec.cid,
          title:
            typeof rec.value?.title === "string" && rec.value.title.trim()
              ? rec.value.title.trim()
              : rec.uri.split("/").pop() ?? "(untitled cert)",
          createdAt:
            typeof rec.value?.createdAt === "string" ? rec.value.createdAt : "",
        }))
        records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setOwnCerts(records.map(({ uri, cid, title }) => ({ uri, cid, title })))
      })
      .catch(() => {
        // Quick-pick is best-effort.
      })
      .finally(() => {
        if (!controller.signal.aborted) setOwnCertsLoading(false)
      })
    return () => controller.abort()
  }, [sessionDid, activeOrg])

  // Revoke object URL on unmount.
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
    bannerRemoved,
  ])

  const handleBannerFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingBannerPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setBannerRemoved(false)
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
    setBannerRemoved(true)
  }, [])

  // Banner-image resolution: in-flight preview > existing server
  // banner (unless removed) > null (placeholder rendered by parent).
  // Banner + image fields both follow the smallImage / largeImage
  // shape (BlobRef under `.image`); the same resolver project-detail
  // uses works for both. `banner` is the new field; legacy projects
  // sometimes only carry `image` as a square hero. Prefer banner.
  const rawBannerOrImage =
    (project?.value as Record<string, unknown> | undefined)?.banner ??
    (project?.value as Record<string, unknown> | undefined)?.image
  const existingBannerUrl =
    !bannerRemoved && rawBannerOrImage && did
      ? resolveActivityImageUrl(
          rawBannerOrImage as Parameters<typeof resolveActivityImageUrl>[0],
          did,
        )
      : null
  const displayBannerUrl = pendingBannerPreviewUrl ?? existingBannerUrl

  // Loading / sign-in gates.
  if (authLoading || projectLoading) {
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
              title="Sign in to edit"
              description="You need to be signed in to edit a project."
            />
          </div>
        </div>
      </div>
    )
  }

  if (projectError || !project) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={FolderGit2}
              title="Project not found"
              description={projectError || "Couldn't load this project to edit."}
            />
          </div>
        </div>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={FolderGit2}
              title="You can't edit this project"
              description="Only the project's creator (or the active group it's published under) can make changes."
            />
          </div>
        </div>
      </div>
    )
  }

  const trimmedTitleCount = countGraphemes(title.trim())
  const titleUnder = trimmedTitleCount > 0 && trimmedTitleCount < TITLE_MIN
  const titleOver = titleCount > TITLE_MAX
  const shortDescOver = shortDescCount > SHORT_DESC_MAX
  const canSubmit =
    !!sessionDid &&
    !!did &&
    !!rkey &&
    !!mountSnapshot &&
    trimmedTitleCount >= TITLE_MIN &&
    titleCount <= TITLE_MAX &&
    shortDescCount <= SHORT_DESC_MAX &&
    !isSubmitting

  const doSave = async () => {
    if (!canSubmit) return
    if (!sessionDid || !did || !rkey || !mountSnapshot) return

    setIsSubmitting(true)
    setError(null)

    // Overlay form values on the captured snapshot so anything outside
    // the form's surface (createdAt, contributors, dates, type) survives
    // a round-trip unchanged.
    const next: Record<string, unknown> = {
      ...(mountSnapshot.value as Record<string, unknown>),
      title: title.trim(),
    }
    if (shortDescription.trim()) {
      next.shortDescription = shortDescription.trim()
    } else {
      delete next.shortDescription
    }
    if (description && !isEmptyLongDescription(description)) {
      next.description = description
    } else {
      delete next.description
    }
    if (pendingBannerBlob) {
      const banner: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        image: pendingBannerBlob as unknown as BlobRef,
      }
      next.banner = banner
      delete next.image
    } else if (bannerRemoved) {
      delete next.banner
      delete next.image
    }
    if (items.length > 0) {
      next.items = items.map((c) => ({
        itemIdentifier: { uri: c.uri, cid: c.cid },
      }))
    } else {
      delete next.items
    }
    if (location) {
      next.location = { uri: location.ref.uri, cid: location.ref.cid }
    } else {
      delete next.location
    }

    try {
      // Same shape as the cert edit page: saveWithSwap diffs on a
      // small user-facing slice; the full record is rebuilt in `write`
      // via the overlay above so we don't need a wide TypeScript type.
      type UserShape = {
        title: string
        shortDescription: string
        description: LinearDocument | null
        [key: string]: unknown
      }
      const userDrafts: UserShape = {
        title: title.trim(),
        shortDescription: shortDescription.trim(),
        description: description,
      }
      const userMountSnapshot: UserShape = {
        title: asString(mountSnapshot.value.title),
        shortDescription: asString(mountSnapshot.value.shortDescription),
        description: asLinearDocument(mountSnapshot.value.description) ?? null,
      }
      const result = await saveWithSwap<UserShape, UserShape>({
        mountSnapshot: userMountSnapshot,
        initialCid: mountSnapshot.cid,
        drafts: userDrafts,
        computeNext: (_serverShape, draftsArg) => draftsArg,
        write: async (_userNext, swapRecord) => {
          await putProjectRecord(
            sessionDid,
            editTargetDid ?? sessionDid,
            rkey,
            next as CollectionValue,
            { swapRecord },
          )
        },
        read: async () => {
          const qs = new URLSearchParams({
            repo: did,
            collection: "org.hypercerts.collection",
            rkey,
          })
          const res = await fetch(
            `/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`,
          )
          if (!res.ok) throw new Error(`Re-read failed (${res.status})`)
          const data = (await res.json()) as {
            cid: string
            value: CollectionValue
          }
          return {
            cid: data.cid,
            value: {
              title: asString(data.value.title),
              shortDescription: asString(data.value.shortDescription),
              description:
                asLinearDocument(data.value.description) ?? null,
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
        `/project/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
      )
    } catch (err) {
      if (err instanceof InvalidSwapError) {
        setError(
          "Someone else saved while you were editing — please refresh and try again.",
        )
      } else {
        setError(err instanceof Error ? err.message : "Failed to save project")
      }
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (did && rkey) {
      router.push(
        `/project/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
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
        label="Editing project"
        error={error}
        isSaving={isSubmitting}
        canSave={canSubmit}
        onCancel={handleCancel}
        onSave={() => {
          void doSave()
        }}
      />
      <article className="project-detail-page project-detail--wide create-project">
        <div className="project-detail">
          <div
            className={
              displayBannerUrl
                ? "project-detail__hero create-project__hero"
                : "project-detail__hero project-detail__hero--placeholder create-project__hero"
            }
          >
            {displayBannerUrl ? (
              <Image
                src={displayBannerUrl}
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
              hasImage={!!displayBannerUrl}
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
              placeholder="Full description of this project."
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
              <h2 className="cert-detail__section-title">Certs</h2>
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
                        setItems((rows) => rows.filter((r) => r.uri !== c.uri))
                      }
                    >
                      <X size={14} strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {ownCertsLoading ? (
              <p className="cert-detail__empty-line">Loading your certs…</p>
            ) : ownCerts.length === 0 ? (
              <p className="cert-detail__empty-line">
                You don&rsquo;t have any certs yet.{" "}
                <Link href="/create" className="create-project__inline-link">
                  Create your first cert
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="create-project__quick-pick-label">
                  Add your certs:
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
          </section>
        </div>
      </article>

      {isLocationDialogOpen && sessionDid ? (
        <LocationPickerDialog
          ownDid={sessionDid}
          targetDid={activeOrg ? activeOrg.groupDid : sessionDid}
          onClose={() => setIsLocationDialogOpen(false)}
          onPick={(added) => {
            setLocation(added)
            setIsLocationDialogOpen(false)
          }}
        />
      ) : null}
    </form>
  )
}
