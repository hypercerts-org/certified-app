"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import { uploadBlob } from "@/lib/atproto/profile"
import {
  writeContextUpdate,
  type ContextAttachmentValue,
} from "@/lib/atproto/context-attachment"
import type { LinearDocument } from "@/lib/leaflet/types"

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
   *  unedited fields like `content` survive) and its CID (swapRecord). */
  initialValue?: ContextAttachmentValue
  initialCid?: string
}

/**
 * Shared create / edit form for an `org.hypercerts.context.attachment`
 * "update". The two modes differ only in whether a new record is minted
 * or an existing one is overwritten (with a swapRecord guard) — the
 * fields and layout are identical.
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
  const [description, setDescription] = useState<LinearDocument | null>(
    () => (initialValue?.description as LinearDocument | undefined) ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A group write is one where the subject (and so the update) lives in
  // a different repo than the viewer's own — image uploads then target
  // that group's blob store too.
  const isGroupWrite = targetDid !== ownDid
  // New updates need the subject's CID for the strongRef; edits reuse
  // the subjects already on the record.
  const canSave =
    title.trim().length > 0 &&
    (mode === "edit" || !!subjectCid) &&
    !saving

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
        // Round-trip unknown / unedited fields (e.g. `content`) on edit.
        ...(initialValue ?? {}),
        contentType: "update",
        title: title.trim(),
        description: description ?? undefined,
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
