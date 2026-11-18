"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Paperclip, X } from "lucide-react"
import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import Button from "@/components/ui/button"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import Tooltip from "@/components/ui/tooltip"
import FormActionBar from "@/components/create/form-action-bar"
import { useOrg } from "@/lib/groups/org-context"
import { uploadBlob, buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/atproto/blob-types"
import { invalidateContextUpdates } from "@/hooks/use-context-updates"
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"
import { caughtErrorMessage } from "@/lib/utils/user-error"
import { problemsMessage } from "@/components/create/form-errors"
import {
  writeContextUpdate,
  resolveAttachment,
  mimeTypeLabel,
  formatAttachmentSize,
  ATTACHMENT_BLOB_TYPE,
  type ContextAttachmentValue,
  type ContextAttachmentContentBlob,
} from "@/lib/atproto/context-attachment"
import type { LinearDocument } from "@/lib/leaflet/types"

// Client-side cap. Matches the real server ceiling — Vercel rejects
// serverless request bodies over ~4.5MB before either upload route runs,
// so a larger cap here would only buy a failed round-trip.
const MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_BYTES
// Character limit for the short summary — matches the lexicon's 300-char
// cap (kept in sync with the count UI and the textarea maxLength).
const SHORT_DESCRIPTION_MAX = 300

interface UpdateFormProps {
  /** Viewer's personal session DID — `writeToRepo`'s `ownDid`. */
  ownDid: string
  /** Repo the update is written to: the subject's author DID. Equals
   *  `ownDid` for a personal subject, or a group DID when posting as a
   *  group the viewer admins (the write then routes through the BFF). */
  targetDid: string
  /** at:// URI of the activity / project the update is about. */
  subjectUri: string
  /** CID of the subject record — needed for the strongRef on NEW
   *  updates. Unused on edit (subjects are round-tripped). */
  subjectCid: string | null
  /** Where Cancel and a successful save navigate to. */
  backHref: string
  mode: "create" | "edit"
  /** Edit only — rkey of the update being edited. */
  rkey?: string
  /** Edit only — the existing record value (round-tripped so unknown /
   *  unedited fields survive) and its CID (swapRecord). */
  initialValue?: ContextAttachmentValue
  initialCid?: string
}

/**
 * Shared create / edit page for an `org.hypercerts.context.attachment`
 * "update": a short summary, a rich-text body, and file attachments
 * (the lexicon's `content[]`). The two modes differ only in whether a
 * new record is minted or an existing one is overwritten (with a
 * swapRecord guard) — the fields and layout are identical.
 *
 * Laid out like the other forms: `PageContainer` (narrow) → `PageHeader`
 * (the page's h1, back to the record's Updates) → the fields → the shared
 * `FormActionBar`.
 */
export default function UpdateForm({
  ownDid,
  targetDid,
  subjectUri,
  subjectCid,
  backHref,
  mode,
  rkey,
  initialValue,
  initialCid,
}: UpdateFormProps) {
  const router = useRouter()
  const { activeOrg } = useOrg()
  const [title, setTitle] = useState(() =>
    typeof initialValue?.title === "string" ? initialValue.title : "",
  )
  const [shortDescription, setShortDescription] = useState(() =>
    typeof initialValue?.shortDescription === "string"
      ? initialValue.shortDescription
      : "",
  )
  const [description, setDescription] = useState<LinearDocument | null>(
    () => (initialValue?.description as LinearDocument | undefined) ?? null,
  )
  // Attachment entries (`content[]`) — existing ones round-trip, new
  // uploads append as `org.hypercerts.defs#smallBlob` envelopes.
  const [content, setContent] = useState<ContextAttachmentContentBlob[]>(
    () => initialValue?.content ?? [],
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // The one validation rule (DESIGN.md §9.2): the title's error shows once
  // the field has been left, or after a save attempt, then follows the
  // typing live. The button stays enabled except while saving.
  const [titleLeft, setTitleLeft] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // Unsaved-changes guard, as on the other create and edit forms: typing
  // in any field (the description editor too) or an attachment change.
  const [hasInteracted, setHasInteracted] = useState(false)
  const { confirmDiscard } = useUnsavedChangesGuard(hasInteracted && !saving)
  // Blob CID → local object URL for attachments uploaded in this form
  // session. A PDS keeps an uploaded blob in temp storage until a record
  // references it, so `com.atproto.sync.getBlob` 404s for anything the
  // user just picked — the thumbnail would render as a broken image
  // until the update is saved. Previewing the local File bridges that
  // gap. Same problem, and same fix, as `LeafletImageStorage.pendingBlobs`
  // in `components/leaflet/nodes/leaflet-image-node.tsx` (which covers
  // images placed in the rich-text body rather than attached as files).
  // State, because render reads it; the ref below only tracks the URLs
  // to free on unmount.
  const [pendingPreviews, setPendingPreviews] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  )
  const previewUrlsRef = useRef<Set<string>>(new Set())

  // Free the session's object URLs on unmount. Deliberately NOT freed in
  // `removeAttachment`: blobs are content-addressed, so attaching the
  // same image twice yields two entries sharing one CID — and one URL.
  // Revoking on the first removal would break the surviving chip.
  useEffect(() => {
    const urls = previewUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  // A group write is one where the subject (and so the update) lives in
  // a different repo than the viewer's own — uploads target that group's
  // blob store too.
  const isGroupWrite = targetDid !== ownDid
  // The action bar names who the update is written as, from the active
  // identity. Only show it when that matches the repo the update goes to
  // (an admin can post to a group's record without switching to it).
  const identityMatchesTarget = isGroupWrite
    ? activeOrg?.groupDid === targetDid
    : !activeOrg
  const titleMissing = title.trim().length === 0
  const titleError =
    titleMissing && (titleLeft || submitAttempted) ? "Add a title." : undefined

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setError(
        `That file is too large. Attachments can be up to ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB.`,
      )
      return
    }
    setHasInteracted(true)
    setUploading(true)
    setError(null)
    try {
      const blob = await uploadBlob(file, {
        ...(isGroupWrite ? { targetDid } : {}),
        attachment: true,
      })
      const entry: ContextAttachmentContentBlob = {
        $type: ATTACHMENT_BLOB_TYPE,
        blob: blob as ContextAttachmentContentBlob["blob"],
      }
      // Key the preview off what `resolveAttachment` reports rather than
      // the raw `blob.ref.$link` — the resolver also unwraps the
      // `map[$link:…]` string form, and the render path looks the CID up
      // through that same function. Gate on its `kind` too, so a blob the
      // server typed as a non-image falls through to the file label.
      const resolved = resolveAttachment(entry)
      if (resolved?.kind === "image") {
        const url = URL.createObjectURL(file)
        previewUrlsRef.current.add(url)
        setPendingPreviews((prev) => new Map(prev).set(resolved.cid, url))
      }
      setContent((prev) => [...prev, entry])
    } catch (err) {
      setError(caughtErrorMessage(err, "Couldn't upload the attachment. Try again"))
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (idx: number) => {
    setHasInteracted(true)
    setContent((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    // The button stays enabled so a click always explains itself: list
    // what's missing and focus the first field that needs attention.
    const unmet = [
      titleMissing && "add a title",
      uploading && "wait for the attachment to finish uploading",
      mode === "create" &&
        !subjectCid &&
        "reload the page (the record this update is about didn't load)",
    ].filter((m): m is string => !!m)
    if (unmet.length > 0) {
      setSubmitAttempted(true)
      setError(problemsMessage(mode === "edit" ? "Before saving" : "Before posting", unmet))
      if (titleMissing) titleRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const subjects =
        initialValue?.subjects ??
        (subjectCid ? [{ uri: subjectUri, cid: subjectCid }] : [])
      const record: ContextAttachmentValue = {
        // Round-trip unknown / unedited fields on edit.
        ...(initialValue ?? {}),
        contentType: "update",
        title: title.trim(),
        shortDescription: shortDescription.trim() || undefined,
        description: description ?? undefined,
        content: content.length > 0 ? content : undefined,
        subjects,
        // Preserve the original post time on edit; stamp now on create.
        createdAt: initialValue?.createdAt ?? new Date().toISOString(),
      }
      await writeContextUpdate(ownDid, targetDid, record, {
        rkey: mode === "edit" ? rkey : undefined,
        swapRecord: mode === "edit" ? initialCid : undefined,
      })
      // The detail pages read updates through a shared module cache
      // (use-context-updates). This form lives on its own route, so no
      // hook instance is mounted to refetch — mark every targeted
      // subject stale so the page we navigate back to re-fetches
      // instead of serving the pre-save list.
      invalidateContextUpdates(subjectUri)
      for (const s of subjects) {
        if (typeof s.uri === "string" && s.uri !== subjectUri) {
          invalidateContextUpdates(s.uri)
        }
      }
      router.push(backHref)
    } catch (err) {
      setError(
        caughtErrorMessage(
          err,
          mode === "edit"
            ? "Couldn't save your changes. They're still here; try again"
            : "Couldn't post the update. Your draft is still here; try again",
        ),
      )
      setSaving(false)
    }
  }

  const heading = mode === "edit" ? "Edit update" : "New update"

  return (
    <PageContainer width="narrow">
      <PageHeader
        back={{ href: backHref, label: "Updates" }}
        title={heading}
        description="What happened since this record was published. You can attach files."
      />
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={handleSubmit}
        onInput={() => setHasInteracted(true)}
      >
        <Input
          ref={titleRef}
          label="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (error) setError(null)
          }}
          onBlur={() => setTitleLeft(true)}
          error={titleError}
          maxLength={300}
          placeholder="What's the update?"
        />

        <Textarea
          label="Short description (optional)"
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          rows={2}
          maxLength={SHORT_DESCRIPTION_MAX}
          showCount
          placeholder="A one- or two-line summary."
        />

        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-ui font-medium text-[var(--fg-secondary)]" aria-hidden>
            Description (optional)
          </p>
          <LeafletEditor
            value={description}
            onChange={setDescription}
            placeholder="Add details. Headings, lists, links, images, and video embeds are supported via the toolbar."
            ariaLabel="Description (optional)"
            did={targetDid}
            onImageUpload={(file) =>
              uploadBlob(file, isGroupWrite ? { targetDid } : undefined)
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-ui font-medium text-[var(--fg-secondary)]">
            Attachments (optional)
          </p>
          {content.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {content.map((entry, i) => {
                const a = resolveAttachment(entry)
                if (!a) return null
                // Prefer this session's local preview; fall back to the
                // getBlob proxy for attachments the saved record already
                // references (edit mode).
                const imgUrl =
                  a.kind === "image"
                    ? (pendingPreviews.get(a.cid) ??
                      buildAvatarUrlFromCid(targetDid, a.cid))
                    : null
                return (
                  <li
                    key={`${i}-${a.kind === "uri" ? a.uri : a.cid}`}
                    className="relative flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1.5 pr-7"
                  >
                    {imgUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={imgUrl}
                        alt=""
                        className="h-10 w-10 rounded-[var(--radius)] object-cover"
                      />
                    ) : (
                      <span className="flex flex-col text-xs">
                        <span className="font-medium text-[var(--fg-primary)]">
                          {a.kind === "uri"
                            ? "Link"
                            : mimeTypeLabel(a.mimeType)}
                        </span>
                        {a.kind !== "uri" && formatAttachmentSize(a.size) ? (
                          <span className="text-[var(--fg-muted)]">
                            {formatAttachmentSize(a.size)}
                          </span>
                        ) : null}
                      </span>
                    )}
                    <Tooltip label="Remove attachment" className="absolute right-1 top-1">
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => removeAttachment(i)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius)] text-[var(--fg-muted)] hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)]"
                      >
                        <X size={14} strokeWidth={1.75} aria-hidden />
                      </button>
                    </Tooltip>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            loading={uploading}
            disabled={uploading || saving}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={14} strokeWidth={1.75} aria-hidden />
            Add attachment
          </Button>
        </div>

        <FormActionBar
          submitLabel={mode === "edit" ? "Save changes" : "Post update"}
          submittingLabel={mode === "edit" ? "Saving…" : "Posting…"}
          isSubmitting={saving}
          error={error}
          onCancel={() => confirmDiscard(() => router.push(backHref))}
          identityLabel={
            identityMatchesTarget
              ? mode === "edit"
                ? "Saving as"
                : "Posting as"
              : null
          }
        />
      </form>
    </PageContainer>
  )
}
