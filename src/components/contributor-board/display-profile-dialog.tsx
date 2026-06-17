"use client"

import { useRef, useState } from "react"
import FormDialog from "@/components/ui/form-dialog"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import { uploadBlob } from "@/lib/atproto/profile"
import { putDisplayProfile } from "@/lib/atproto/hyperboard"
import type {
  BoardImage,
  DisplayProfileRecord,
} from "@/lib/atproto/hyperboard-types"

interface DisplayProfileDialogProps {
  /** the viewer's own DID (the record is written to their PDS) */
  did: string
  initial: DisplayProfileRecord | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Edit the viewer's own org.hyperboards.displayProfile — their self-declared
 * appearance across every contributor board, used in addition to their actor
 * profile. Stored at rkey `self` in their own PDS.
 */
export function DisplayProfileDialog({
  did,
  initial,
  onClose,
  onSaved,
}: DisplayProfileDialogProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "")
  const [videoUrl, setVideoUrl] = useState(
    initial?.video && "uri" in initial.video ? initial.video.uri : "",
  )
  const [hoverIframeUrl, setHoverIframeUrl] = useState(initial?.hoverIframeUrl ?? "")
  const [url, setUrl] = useState(initial?.url ?? "")
  const [imageRef, setImageRef] = useState<BoardImage | null>(initial?.image ?? null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const blob = await uploadBlob(file)
      setImageRef({ $type: "org.hypercerts.defs#smallImage", image: blob as never })
      setImagePreview(URL.createObjectURL(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    setError(null)
    setSaving(true)
    try {
      const record: Omit<DisplayProfileRecord, "$type" | "createdAt"> & {
        createdAt?: string
      } = {
        createdAt: initial?.createdAt,
      }
      if (displayName.trim()) record.displayName = displayName.trim()
      if (imageRef) record.image = imageRef
      if (videoUrl.trim())
        record.video = { $type: "org.hypercerts.defs#uri", uri: videoUrl.trim() }
      if (hoverIframeUrl.trim()) record.hoverIframeUrl = hoverIframeUrl.trim()
      if (url.trim()) record.url = url.trim()

      await putDisplayProfile(did, record)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
      setSaving(false)
    }
  }

  return (
    <FormDialog
      title="My board appearance"
      onClose={onClose}
      onSubmit={handleSubmit}
      isSubmitting={uploading || saving}
      submitLabel="Save"
      maxWidth={460}
    >
      <p className="mb-3 text-body-sm text-[var(--fg-muted)]">
        How you appear on contributor boards, in addition to your profile.
        Board owners can still override this on their own board.
      </p>

      <Input
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {imagePreview || imageRef ? "Change image" : "Upload image"}
        </Button>
      </div>

      <div className="mt-3">
        <Input
          label="Video URL (optional)"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
      </div>
      <div className="mt-3">
        <Input
          label="Hover iframe URL (optional)"
          value={hoverIframeUrl}
          onChange={(e) => setHoverIframeUrl(e.target.value)}
        />
      </div>
      <div className="mt-3">
        <Input
          label="Link URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      {error ? (
        <p className="mt-3 text-body-sm text-[var(--color-error)]">{error}</p>
      ) : null}
    </FormDialog>
  )
}

export default DisplayProfileDialog
