"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Paperclip, X } from "lucide-react"
import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import Tooltip from "@/components/ui/tooltip"
import { uploadBlob, buildAvatarUrlFromCid } from "@/lib/atproto/profile"
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

// Client-side cap; the PDS enforces its own hard blob limit.
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
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
 * Shared create / edit form for an `org.hypercerts.context.attachment`
 * "update": a short summary, a rich-text body, and file attachments
 * (the lexicon's `content[]`). The two modes differ only in whether a
 * new record is minted or an existing one is overwritten (with a
 * swapRecord guard) — the fields and layout are identical.
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

  // A group write is one where the subject (and so the update) lives in
  // a different repo than the viewer's own — uploads target that group's
  // blob store too.
  const isGroupWrite = targetDid !== ownDid
  const canSave =
    title.trim().length > 0 &&
    (mode === "edit" || !!subjectCid) &&
    !saving &&
    !uploading

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setError(
        `Attachment is too large (max ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB).`,
      )
      return
    }
    setUploading(true)
    setError(null)
    try {
      const blob = await uploadBlob(file, {
        ...(isGroupWrite ? { targetDid } : {}),
        allowAnyType: true,
      })
      setContent((prev) => [
        ...prev,
        {
          $type: ATTACHMENT_BLOB_TYPE,
          blob: blob as ContextAttachmentContentBlob["blob"],
        },
      ])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload attachment",
      )
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (idx: number) =>
    setContent((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
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
      router.push(backHref)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save update")
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-5 py-2" onSubmit={handleSubmit}>
      <h1 className="font-headline text-h3">
        {mode === "edit" ? "Edit update" : "New update"}
      </h1>

      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={300}
        placeholder="What's the update?"
      />

      <div className="flex flex-col gap-1">
        <Textarea
          label="Short description"
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          rows={2}
          maxLength={SHORT_DESCRIPTION_MAX}
          placeholder="A one- or two-line summary (optional)."
        />
        <span className="self-end text-xs text-[var(--fg-muted)]">
          {shortDescription.length}/{SHORT_DESCRIPTION_MAX} characters
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-[var(--fg-primary)]">
          Description
        </label>
        <LeafletEditor
          value={description}
          onChange={setDescription}
          placeholder="Add details. Headings, lists, links, images, and video embeds are supported via the toolbar."
          ariaLabel="Update description"
          did={targetDid}
          onImageUpload={(file) =>
            uploadBlob(file, isGroupWrite ? { targetDid } : undefined)
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--fg-primary)]">
          Attachments
        </label>
        {content.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {content.map((entry, i) => {
              const a = resolveAttachment(entry)
              if (!a) return null
              const imgUrl =
                a.kind === "image"
                  ? buildAvatarUrlFromCid(targetDid, a.cid)
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
                      <X size={13} strokeWidth={2} aria-hidden />
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

      {error ? <ErrorMessage message={error} /> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(backHref)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabled={!canSave}
        >
          {mode === "edit" ? "Save changes" : "Post update"}
        </Button>
      </div>
    </form>
  )
}
