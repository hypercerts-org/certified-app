"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Button from "@/components/ui/button"
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  File,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { useContextUpdates } from "@/hooks/use-context-updates"
import {
  deleteContextUpdate,
  formatAttachmentSize,
  mimeTypeLabel,
  resolveAttachment,
  uriHost,
  uriThumbnailUrl,
  type ContextAttachmentRecord,
  type ResolvedAttachment,
} from "@/lib/atproto/context-attachment"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { recordUrlFromAtUri } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"

interface ContextUpdatesProps {
  /** at:// URI of the cert or project these updates target. */
  subjectUri: string
  /** Section heading override. Defaults to "Updates". */
  heading?: string
  /**
   * "overview" clamps each update's body to a few lines with an inline
   * "Read more" affordance per card; useful as a preview slot on the
   * cert / project overview tab.
   * "full" renders every update at full length — for the dedicated
   * Updates subtab.
   */
  variant?: "overview" | "full"
  /**
   * Optional href that surfaces a "See all" link in the section
   * header when variant is "overview" and there's a dedicated tab to
   * jump to (e.g. `?tab=updates`).
   */
  seeAllHref?: string | null
  /**
   * Cap the number of update cards rendered. The count badge still
   * reflects the true total, so the "See all" link reads correctly.
   * Unset = render every update.
   */
  maxItems?: number
  /**
   * When true (and variant is "full"), the viewer can manage updates:
   * a "New update" button is shown in the header / empty state, and
   * each card gets Edit + Delete affordances. Set by the detail pages
   * when the viewer is the subject's author (own profile or a group
   * they admin).
   */
  canEdit?: boolean
  /** Viewer's personal session DID — the `ownDid` for delete writes.
   *  Required for the delete affordance to function. */
  viewerDid?: string | null
}

/**
 * Read-only list of `org.hypercerts.context.attachment` records with
 * `contentType === "update"` whose `subjects` include `subjectUri`.
 *
 * Renders nothing (not even an empty state) when there are no updates,
 * so the section quietly disappears from detail pages whose authors
 * haven't published any.
 */
export default function ContextUpdates({
  subjectUri,
  heading = "Updates",
  variant = "full",
  seeAllHref = null,
  maxItems,
  canEdit = false,
  viewerDid = null,
}: ContextUpdatesProps) {
  const { updates, isLoading, error, refetch, removeUpdate } =
    useContextUpdates(subjectUri)
  const visibleUpdates =
    typeof maxItems === "number" ? updates.slice(0, maxItems) : updates

  // Management affordances (New / Edit / Delete) live on the dedicated
  // Updates tab only — the overview preview stays read-only.
  const manage = canEdit && variant === "full"
  // Base record URL the update routes hang off — `/{actor}/{type}/{rkey}`
  // derived from the subject's at:// URI (actor is the DID; the route
  // canonicalizes to the handle form on load).
  const base = recordUrlFromAtUri(subjectUri)
  const newHref = base ? `${base}/update/new` : null
  const router = useRouter()

  const newButton =
    manage && newHref ? (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="ml-auto"
        onClick={() => router.push(newHref)}
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden />
        New update
      </Button>
    ) : null

  if (isLoading) {
    return (
      <section className="context-updates" aria-labelledby="context-updates-heading">
        <header className="context-updates__head">
          <h2 id="context-updates-heading" className="context-updates__heading">
            {heading}
          </h2>
        </header>
        <div className="context-updates__loading">
          <LoadingSpinner size="sm" />
        </div>
      </section>
    )
  }

  if (error) {
    return null
  }

  if (updates.length === 0) {
    if (variant === "full") {
      return (
        <section
          className="context-updates context-updates--full"
          aria-labelledby="context-updates-heading"
        >
          <header className="context-updates__head">
            <MessageSquareText
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className="context-updates__icon"
            />
            <h2 id="context-updates-heading" className="context-updates__heading">
              {heading}
            </h2>
            {newButton}
          </header>
          <p className="context-updates__empty">No updates yet.</p>
        </section>
      )
    }
    return null
  }

  return (
    <section
      className={
        variant === "full"
          ? "context-updates context-updates--full"
          : "context-updates context-updates--overview"
      }
      aria-labelledby="context-updates-heading"
    >
      <header className="context-updates__head">
        <MessageSquareText
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="context-updates__icon"
        />
        <h2 id="context-updates-heading" className="context-updates__heading">
          {heading}
        </h2>
        <span className="context-updates__count">{updates.length}</span>
        {variant === "overview" && seeAllHref ? (
          <Link
            href={seeAllHref}
            replace
            scroll={false}
            className="context-updates__see-all"
          >
            See all →
          </Link>
        ) : null}
        {newButton}
      </header>
      <ul className="context-updates__list">
        {visibleUpdates.map((u) => (
          // Clamp in both variants — the dedicated Updates subtab gets
          // the same Read more / Show less affordance as the overview
          // preview, so a single long update doesn't dominate the tab.
          <UpdateCard
            key={u.uri}
            record={u}
            clamp
            base={manage ? base : null}
            viewerDid={viewerDid}
            onChanged={refetch}
            onDeleted={removeUpdate}
          />
        ))}
      </ul>
    </section>
  )
}

interface UpdateCardProps {
  record: ContextAttachmentRecord
  /** When true, clamp the description to a few lines and surface a
   *  "Read more" affordance if the content overflows. */
  clamp: boolean
  /** Base record URL (`/{actor}/{type}/{rkey}`) the edit route hangs
   *  off. Non-null ONLY in manage mode — when set, the card renders
   *  Edit + Delete affordances. */
  base?: string | null
  /** Viewer's personal session DID — the `ownDid` for the delete write. */
  viewerDid?: string | null
  /** Called after a successful delete so the list re-fetches. */
  onChanged?: () => void
  /** Called with the deleted record's URI so the parent can drop it from
   *  the list immediately (the indexer lags, so a plain refetch leaves the
   *  card on screen and reads as a failed delete). */
  onDeleted?: (uri: string) => void
}

function UpdateCard({
  record,
  clamp,
  base = null,
  viewerDid = null,
  onChanged,
  onDeleted,
}: UpdateCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const docWrapRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { value, uri } = record
  const parsed = parseAtUri(uri)
  const authorDid = parsed?.did ?? null
  const updateRkey = parsed?.rkey ?? null
  // Manage affordances need the edit route base, the record's rkey, and
  // (for delete) both the viewer's DID and the record's author DID.
  const canManage = !!base && !!updateRkey
  const editHref = canManage ? `${base}/update/${updateRkey}/edit` : null

  const handleDelete = async () => {
    if (!viewerDid || !authorDid || !updateRkey) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteContextUpdate(viewerDid, authorDid, updateRkey)
      setConfirmingDelete(false)
      // Drop the card immediately so the delete reads as instant, then
      // reconcile with the backend (the optimistic removal is guarded
      // against the indexer's lag, so the refetch can't bring it back).
      onDeleted?.(uri)
      onChanged?.()
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete update",
      )
    } finally {
      setDeleting(false)
    }
  }

  const title =
    typeof value.title === "string" && value.title.length > 0
      ? value.title
      : null
  const shortDesc =
    typeof value.shortDescription === "string" &&
    value.shortDescription.length > 0
      ? value.shortDescription
      : null
  const createdAt =
    typeof value.createdAt === "string" ? value.createdAt : null
  const createdLabel = createdAt ? formatShortDate(createdAt) : null

  // Normalize the heterogeneous content[] union into render-ready
  // attachment shapes. Filters out malformed entries silently —
  // partial breakage shouldn't take the whole card down.
  const attachments: ResolvedAttachment[] = (value.content ?? [])
    .map((entry) => resolveAttachment(entry))
    .filter((a): a is ResolvedAttachment => a !== null)

  // After render: if clamped and the description's scroll height
  // exceeds the visible (clamped) height, surface the "Read more"
  // toggle. Re-measure when the content reference identity changes.
  useLayoutEffect(() => {
    if (!clamp || expanded) {
      setIsTruncated(false)
      return
    }
    const el = docWrapRef.current
    if (!el) return
    setIsTruncated(el.scrollHeight - el.clientHeight > 2)
  }, [clamp, expanded, value.description])

  const docClass = clamp && !expanded
    ? "context-updates__doc-wrap context-updates__doc-wrap--clamped"
    : "context-updates__doc-wrap"

  return (
    <li className="context-updates__item">
      <header className="context-updates__item-head">
        {title ? (
          <h3 className="context-updates__title">{title}</h3>
        ) : null}
        {createdLabel ? (
          <time
            className="context-updates__when"
            dateTime={createdAt ?? undefined}
          >
            {createdLabel}
          </time>
        ) : null}
        {canManage ? (
          <span className="ml-auto flex items-center gap-1">
            {editHref ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Edit update"
                onClick={() => router.push(editHref)}
              >
                <Pencil size={15} strokeWidth={1.75} aria-hidden />
              </Button>
            ) : null}
            {viewerDid ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Delete update"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={15} strokeWidth={1.75} aria-hidden />
              </Button>
            ) : null}
          </span>
        ) : null}
      </header>

      {shortDesc ? <p className="context-updates__lead">{shortDesc}</p> : null}

      {value.description ? (
        <>
          <div ref={docWrapRef} className={docClass}>
            <LeafletDocument
              value={value.description}
              did={authorDid ?? undefined}
              className="context-updates__doc"
              minHeadingLevel={3}
            />
          </div>
          {clamp && (isTruncated || expanded) ? (
            <button
              type="button"
              className="context-updates__expand"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  Show less
                  <ChevronUp size={14} strokeWidth={1.75} aria-hidden />
                </>
              ) : (
                <>
                  Read more
                  <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
                </>
              )}
            </button>
          ) : null}
        </>
      ) : null}

      {attachments.length > 0 && authorDid ? (
        <ul
          className="context-updates__attachments"
          aria-label={`${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`}
        >
          {attachments.map((a, i) => (
            <AttachmentTile key={`${i}-${attachmentKey(a)}`} attachment={a} did={authorDid} />
          ))}
        </ul>
      ) : null}

      {confirmingDelete ? (
        <ConfirmDialog
          title="Delete update"
          message={
            deleteError ??
            "This update will be permanently removed. This can't be undone."
          }
          confirmLabel="Delete"
          confirmVariant="destructive"
          isConfirming={deleting}
          onCancel={() => {
            if (deleting) return
            setConfirmingDelete(false)
            setDeleteError(null)
          }}
          onConfirm={handleDelete}
        />
      ) : null}
    </li>
  )
}

function attachmentKey(a: ResolvedAttachment): string {
  if (a.kind === "uri") return a.uri
  return a.cid
}

function AttachmentTile({
  attachment,
  did,
}: {
  attachment: ResolvedAttachment
  did: string
}) {
  if (attachment.kind === "image") {
    const url = buildAvatarUrlFromCid(did, attachment.cid)
    if (!url) return null
    return (
      <li className="context-updates__attachment context-updates__attachment--image">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="context-updates__attachment-link"
          aria-label="Open image in new tab"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            loading="lazy"
            className="context-updates__attachment-img"
          />
        </a>
      </li>
    )
  }

  if (attachment.kind === "file") {
    const url = buildAvatarUrlFromCid(did, attachment.cid)
    if (!url) return null
    const label = mimeTypeLabel(attachment.mimeType)
    const sizeLabel = formatAttachmentSize(attachment.size)
    return (
      <li className="context-updates__attachment context-updates__attachment--file">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="context-updates__attachment-link"
          aria-label={`Open ${label} attachment in new tab`}
          download
        >
          <File
            size={20}
            strokeWidth={1.5}
            aria-hidden
            className="context-updates__attachment-icon"
          />
          <span className="context-updates__attachment-meta">
            <span className="context-updates__attachment-label">{label}</span>
            {sizeLabel ? (
              <span className="context-updates__attachment-size">
                {sizeLabel}
              </span>
            ) : null}
          </span>
        </a>
      </li>
    )
  }

  // attachment.kind === "uri"
  const host = uriHost(attachment.uri)
  const thumbnail = uriThumbnailUrl(attachment.uri)
  if (thumbnail) {
    return (
      <UriThumbnailTile
        uri={attachment.uri}
        host={host}
        thumbnailUrl={thumbnail}
      />
    )
  }
  return (
    <li className="context-updates__attachment context-updates__attachment--uri">
      <a
        href={attachment.uri}
        target="_blank"
        rel="noopener noreferrer"
        className="context-updates__attachment-link"
      >
        <ExternalLink
          size={20}
          strokeWidth={1.5}
          aria-hidden
          className="context-updates__attachment-icon"
        />
        <span className="context-updates__attachment-meta">
          <span className="context-updates__attachment-label">{host}</span>
          <span
            className="context-updates__attachment-uri"
            title={attachment.uri}
          >
            {attachment.uri}
          </span>
        </span>
      </a>
    </li>
  )
}

function UriThumbnailTile({
  uri,
  host,
  thumbnailUrl,
}: {
  uri: string
  host: string
  thumbnailUrl: string
}) {
  // Fall back to the generic external-link tile when the thumbnail
  // 404s (rare for YouTube hqdefault, but the provider can pull a
  // video — once removed, the placeholder image bytes resolve but
  // the URL responds 404).
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <li className="context-updates__attachment context-updates__attachment--uri">
        <a
          href={uri}
          target="_blank"
          rel="noopener noreferrer"
          className="context-updates__attachment-link"
        >
          <ExternalLink
            size={20}
            strokeWidth={1.5}
            aria-hidden
            className="context-updates__attachment-icon"
          />
          <span className="context-updates__attachment-meta">
            <span className="context-updates__attachment-label">{host}</span>
            <span className="context-updates__attachment-uri" title={uri}>
              {uri}
            </span>
          </span>
        </a>
      </li>
    )
  }
  return (
    <li className="context-updates__attachment context-updates__attachment--video">
      <a
        href={uri}
        target="_blank"
        rel="noopener noreferrer"
        className="context-updates__attachment-link"
        aria-label={`Open video on ${host} in new tab`}
      >
        <span className="context-updates__attachment-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="context-updates__attachment-thumb-img"
          />
          <span
            className="context-updates__attachment-thumb-overlay"
            aria-hidden
          >
            <Play
              size={18}
              strokeWidth={1.75}
              className="context-updates__attachment-play"
              fill="currentColor"
            />
          </span>
        </span>
        <span className="context-updates__attachment-host">{host}</span>
      </a>
    </li>
  )
}
