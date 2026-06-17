"use client"

import { useRef, useState } from "react"
import FormDialog from "@/components/ui/form-dialog"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import SegmentedControl from "@/components/ui/segmented-control"
import { uploadBlob, type UploadedBlob } from "@/lib/atproto/profile"
import { loadResolvedProfile } from "@/lib/atproto/resolve-did-batch"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"
import type {
  StrongRef,
  ContributorIdentity,
  ActivityContributor,
} from "@/lib/atproto/activity-types"
import type { BoardImage } from "@/lib/atproto/hyperboard-types"

/**
 * Edit-time draft for one contributor tile. Held by the editable board and
 * serialized to the activity (identity + weight) + board (contributorConfig)
 * records on save.
 */
export interface DraftContributor {
  key: string
  /** identity on the activity; null for a brand-new manual person */
  identity: ContributorIdentity | StrongRef | null
  /** brand-new manual person → create a contributorInformation record on save */
  isNew: boolean
  weight: number
  displayName: string
  /** preview URL for the avatar (object URL or already-resolved) */
  imagePreview: string | null
  /** pending upload to embed in the record on save */
  imageBlob: UploadedBlob | null
  /** already-stored board image (preserved when editing without re-upload) */
  imageRef: BoardImage | null
  videoUrl: string
  hoverImageUrl: string
  hoverIframeUrl: string
  url: string
  /** when true, this styling overrides the contributor's own profile */
  override: boolean
  /** the original activity contributor (preserves contributionDetails on save) */
  original?: ActivityContributor
}

let draftCounter = 0

export function emptyDraft(): DraftContributor {
  return {
    key: `draft-${Date.now()}-${draftCounter++}`,
    identity: null,
    isNew: true,
    weight: 10,
    displayName: "",
    imagePreview: null,
    imageBlob: null,
    imageRef: null,
    videoUrl: "",
    hoverImageUrl: "",
    hoverIframeUrl: "",
    url: "",
    override: true,
  }
}

interface AddEditContributorDialogProps {
  /** the draft to edit; pass a fresh emptyDraft() to add */
  initial: DraftContributor
  onClose: () => void
  onSave: (draft: DraftContributor) => void
  /** present when editing an existing tile — removes it from the board */
  onRemove?: () => void
}

type Mode = "atproto" | "manual"

export function AddEditContributorDialog({
  initial,
  onClose,
  onSave,
  onRemove,
}: AddEditContributorDialogProps) {
  const isEdit = !initial.isNew || initial.identity !== null
  const initialMode: Mode =
    initial.identity && "identity" in initial.identity ? "atproto" : "manual"

  const [mode, setMode] = useState<Mode>(initialMode)
  const [handle, setHandle] = useState(
    initial.identity && "identity" in initial.identity
      ? initial.identity.identity
      : "",
  )
  const [draft, setDraft] = useState<DraftContributor>(initial)
  const [uploading, setUploading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<DraftContributor>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const handleFile = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      // Board editing is own-repo only, so the blob lands in the viewer's repo.
      const blob = await uploadBlob(file)
      set({ imageBlob: blob, imagePreview: URL.createObjectURL(file), imageRef: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    setError(null)
    const weight = Number.isFinite(draft.weight) && draft.weight > 0 ? draft.weight : 1

    if (mode === "manual") {
      if (!draft.displayName.trim()) {
        setError("Name is required")
        return
      }
      onSave({ ...draft, weight, isNew: initial.isNew, override: true })
      return
    }

    // ATProto: resolve the handle/DID to a profile + canonical identity.
    const id = handle.trim()
    if (!isAtprotoIdentity(id)) {
      setError("Enter a valid handle or DID")
      return
    }
    setResolving(true)
    try {
      const profile = await loadResolvedProfile(id)
      const identity: ContributorIdentity = { identity: id }
      onSave({
        ...draft,
        identity,
        isNew: false,
        weight,
        displayName: profile?.displayName ?? draft.displayName ?? id,
        // atproto contributors keep their own profile unless the board owner
        // explicitly overrides; rich media here applies as a fallback layer.
        override: false,
      })
    } catch {
      setError("Could not resolve that identity")
    } finally {
      setResolving(false)
    }
  }

  return (
    <FormDialog
      title={isEdit ? "Edit contributor" : "Add contributor"}
      onClose={onClose}
      onSubmit={handleSubmit}
      isSubmitting={uploading || resolving}
      submitLabel={isEdit ? "Save" : "Add"}
      maxWidth={460}
    >
      {!isEdit ? (
        <div className="mb-4">
          <SegmentedControl
            aria-label="Contributor type"
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            options={[
              { value: "atproto", label: "AT Protocol" },
              { value: "manual", label: "Manual" },
            ]}
          />
        </div>
      ) : null}

      {mode === "atproto" && !isEdit ? (
        <Input
          label="Handle or DID"
          placeholder="alice.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoFocus
        />
      ) : null}

      {mode === "manual" ? (
        <>
          <Input
            label="Name"
            placeholder="Alice Smith"
            value={draft.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
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
              {draft.imagePreview || draft.imageRef ? "Change image" : "Upload image"}
            </Button>
          </div>
        </>
      ) : null}

      <div className="mt-3">
        <Input
          label="Weight"
          type="number"
          min={1}
          value={String(draft.weight)}
          onChange={(e) => set({ weight: parseFloat(e.target.value) })}
          helperText="Relative tile size — larger means a bigger tile."
        />
      </div>

      <div className="mt-3">
        <Input
          label="Video URL (optional)"
          placeholder="YouTube, Vimeo, Instagram, or .mp4"
          value={draft.videoUrl}
          onChange={(e) => set({ videoUrl: e.target.value })}
        />
      </div>
      <div className="mt-3">
        <Input
          label="Hover image URL (optional)"
          value={draft.hoverImageUrl}
          onChange={(e) => set({ hoverImageUrl: e.target.value })}
        />
      </div>
      <div className="mt-3">
        <Input
          label="Hover iframe URL (optional)"
          value={draft.hoverIframeUrl}
          onChange={(e) => set({ hoverIframeUrl: e.target.value })}
        />
      </div>
      <div className="mt-3">
        <Input
          label="Link URL (optional)"
          placeholder="https://…"
          value={draft.url}
          onChange={(e) => set({ url: e.target.value })}
        />
      </div>

      {error ? (
        <p className="mt-3 text-body-sm text-[var(--color-error-text)]">{error}</p>
      ) : null}

      {onRemove ? (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
            Remove from board
          </Button>
        </div>
      ) : null}
    </FormDialog>
  )
}

export default AddEditContributorDialog
