"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FolderGit2, Inbox, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react"
import ActivityAuthor from "@/components/feed/activity-author"
import ActivityCard from "@/components/feed/activity-card"
import ActivityContributor from "@/components/feed/activity-contributor"
import FeedLayout from "@/components/feed/feed-layout"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import EditBanner from "@/components/ui/edit-banner"
import EmptyState from "@/components/ui/empty-state"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import CertSearch, { type CertSearchResult } from "@/components/search/cert-search"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useProjectItems } from "@/hooks/use-project-items"
import {
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { putProjectRecord } from "@/lib/atproto/project"
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

interface ProjectDetailProps {
  did: string
  rkey: string
  value: CollectionValue
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
export default function ProjectDetail({ did, rkey, value }: ProjectDetailProps) {
  // Edit-eligibility mirrors `activity-detail.tsx:165-184`.
  const { did: sessionDid, isAuthenticated } = useAuth()
  const { activeOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  const isOwner = (!!sessionDid && sessionDid === did) || canEditAsActiveOrg
  const editTargetDid = canEditAsActiveOrg ? did : undefined

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

  // Close the per-card ⋯ menu when clicking outside it, or on ESC.
  // The menu lives inside `.project-detail__cert-menu`, so a click on
  // anything not in that container collapses it.
  useEffect(() => {
    if (!openMenuUri) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest(".project-detail__cert-menu")) return
      setOpenMenuUri(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuUri(null)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [openMenuUri])

  const title =
    asString(effectiveValue.title) ||
    asString(effectiveValue.name) ||
    "Untitled project"

  const shortDesc = asString(effectiveValue.shortDescription)
  const showFullDescription = isRenderableDescription(effectiveValue.description)

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
  const startDate = asString(
    (effectiveValue as Record<string, unknown>).startDate as unknown,
  )
  const endDate = asString(
    (effectiveValue as Record<string, unknown>).endDate as unknown,
  )
  const location = asString(
    (effectiveValue as Record<string, unknown>).location as unknown,
  )

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
  const hasAnyMeta =
    !!createdAt ||
    !!timePeriodLabel ||
    !!location ||
    contributors.length > 0

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
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageRemoved(false)
    setSaveError(null)
    setIsEditing(true)
  }, [effectiveValue])

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
      const blob = await uploadBlob(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      setPendingImageBlob(blob)
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
    setIsSaving(true)
    setSaveError(null)
    try {
      const trimmedTitle =
        drafts.title.trim() || asString(effectiveValue.title) || ""
      const trimmedShort =
        drafts.shortDescription.trim() ||
        asString(effectiveValue.shortDescription) ||
        ""

      // Start from the server value so unedited fields (location,
      // contributors, startDate/endDate, etc.) round-trip untouched.
      // `items` IS now client-writable — overwrite with the draft so
      // add/remove via the picker / per-card menu persists. The BFF
      // route still server-pins createdAt / type and shape-validates
      // items[] before forwarding.
      const next: Record<string, unknown> = {
        ...(effectiveValue as Record<string, unknown>),
        title: trimmedTitle,
        shortDescription: trimmedShort,
        items: draftItems,
      }

      // Description: preserve strongRef when in preserve mode, drop
      // when empty linearDocument, write linearDocument otherwise.
      if (preserveDescription) {
        // Leave `next.description` as the original strongRef.
      } else if (isEmptyLongDescription(drafts.description)) {
        delete next.description
      } else if (drafts.description) {
        next.description = drafts.description
      }

      // Image: explicit Remove drops both legacy `image` and current
      // `banner`. New upload writes to `banner` (lexicon-canonical for
      // collections — see plan A3). Existing `image` is preserved
      // through the spread above if neither remove nor new-upload
      // path fired.
      if (imageRemoved) {
        delete next.banner
        delete next.image
      } else if (pendingImageBlob) {
        const imageValue: HypercertsLargeImage = {
          $type: "org.hypercerts.defs#largeImage",
          image: pendingImageBlob as unknown as BlobRef,
        }
        ;(next as Record<string, unknown>).banner = imageValue
        // If a legacy `image` field exists, drop it so we don't ship
        // two images on the same record.
        delete (next as Record<string, unknown>).image
      }

      await putProjectRecord(
        sessionDid,
        editTargetDid ?? sessionDid,
        rkey,
        next as CollectionValue,
      )
      setLocalValue(next as CollectionValue)
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
      console.error("Failed to save project:", err)
      setSaveError(err instanceof Error ? err.message : "Failed to save project")
    } finally {
      setIsSaving(false)
    }
  }, [
    rkey,
    sessionDid,
    isAuthenticated,
    drafts,
    draftItems,
    effectiveValue,
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

      <article className="project-detail project-detail--wide">
        <header className="project-detail__byline">
          <ActivityAuthor did={did} />
        </header>

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

        <div className="project-detail__head">
          <div className="project-detail__head-row">
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
              <h1 className="project-detail__title">{title}</h1>
            )}
            {!editing && isOwner ? (
              <button
                ref={editBtnRef}
                type="button"
                className="project-detail__edit-btn"
                aria-label="Edit project"
                title="Edit project"
                onClick={handleEditClick}
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                Edit
              </button>
            ) : null}
          </div>
          {editing ? (
            <textarea
              className="project-detail__lead-input"
              value={drafts.shortDescription}
              maxLength={3000}
              placeholder="A short description (one or two lines)…"
              aria-label="Short description"
              onChange={(e) =>
                setDrafts((d) => ({ ...d, shortDescription: e.target.value }))
              }
              rows={2}
            />
          ) : shortDesc ? (
            <p className="project-detail__lead">{shortDesc}</p>
          ) : null}
        </div>

        {editing ? (
          <div className="project-detail__prose project-detail__prose--editing">
            {preserveDescription ? (
              <div className="project-detail__desc-preserve">
                <p>
                  This project&rsquo;s description is hosted on an external
                  record. Editing here will replace the link with new content.
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
            <LeafletDocument value={effectiveValue.description} did={did} />
          </div>
        ) : null}

        {hasAnyMeta ? (
          <aside className="project-detail__meta" aria-label="Project details">
            {createdAt ? (
              <div className="project-detail__meta-row">
                <span className="project-detail__meta-label">Created</span>
                <span className="project-detail__meta-value">
                  <time dateTime={createdAt}>{formatShortDate(createdAt)}</time>
                </span>
              </div>
            ) : null}

            {timePeriodLabel ? (
              <div className="project-detail__meta-row">
                <span className="project-detail__meta-label">Time period</span>
                <span className="project-detail__meta-value">
                  {timePeriodLabel}
                </span>
              </div>
            ) : null}

            {location ? (
              <div className="project-detail__meta-row">
                <span className="project-detail__meta-label">Location</span>
                <span className="project-detail__meta-value">{location}</span>
              </div>
            ) : null}

            {contributors.length > 0 ? (
              <div className="project-detail__meta-row project-detail__meta-row--wide">
                <span className="project-detail__meta-label">Contributors</span>
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

        <section className="project-detail__certs">
          <div className="project-detail__certs-header">
            <h2 className="project-detail__certs-title">Certs in this project</h2>
            <span className="project-detail__certs-count">{certCount}</span>
            {editing && !addingCert ? (
              <button
                type="button"
                className="project-detail__add-cert-btn"
                onClick={() => setAddingCert(true)}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                Add cert
              </button>
            ) : null}
          </div>

          {editing && addingCert ? (
            <div className="project-detail__add-cert-picker">
              <CertSearch
                onSelect={handleAddCert}
                prioritizeAuthorDid={sessionDid ?? undefined}
                excludeUris={draftItemUris}
                placeholder="Search for a cert to add…"
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
                  title="No certs in this project yet"
                  description="Click “Add cert” above to search for and add certs."
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
                      <button
                        type="button"
                        className="project-detail__cert-menu-btn"
                        aria-label="Cert actions"
                        aria-haspopup="menu"
                        aria-expanded={openMenuUri === rec.uri}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setOpenMenuUri((prev) =>
                            prev === rec.uri ? null : rec.uri,
                          )
                        }}
                      >
                        <MoreVertical
                          size={16}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </button>
                      {openMenuUri === rec.uri ? (
                        <div
                          role="menu"
                          className="project-detail__cert-menu-pop"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="project-detail__cert-menu-item"
                            onClick={() => handleRemoveCert(rec.uri)}
                          >
                            <Trash2
                              size={14}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            Remove from project
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <FeedLayout
              activities={resolvedActivities}
              getDid={(uri) => didByUri.get(uri) ?? did}
              isLoading={itemsLoading && resolvedActivities.length === 0}
              isLoadingMore={itemsLoading && resolvedActivities.length > 0}
              error={null}
              hasMore={false}
              loadMore={() => {}}
              emptyState={
                <EmptyState
                  icon={Inbox}
                  title="No certs in this project yet"
                  description="When certs are added to this project, they'll appear here."
                />
              }
            />
          )}
        </section>
      </article>
    </>
  )
}
