"use client"

import { useRef, useState } from "react"
import FormDialog from "@/components/ui/form-dialog"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import SegmentedControl from "@/components/ui/segmented-control"
import { uploadBlob } from "@/lib/atproto/profile"
import type { BoardConfig } from "@/lib/atproto/hyperboard-types"

interface BoardSettingsDialogProps {
  config: BoardConfig
  onClose: () => void
  onSave: (config: BoardConfig) => void
}

type BgKind = "none" | "image" | "iframe"

// Native <input type="color"> requires a hex seed; this is a picker default,
// not a design-system colour. The chosen value is stored as record data.
const COLOR_SEED = "#888888"

/** Normalise a stored opacity (0–1 or 0–100, number or string) to a 0–1 fraction. */
function normalizeOpacity(v: number | string | undefined): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  if (!Number.isFinite(n)) return 0.15
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n))
}

/**
 * Edit a board's cosmetics: aspect ratio, image shape, grayscale, background
 * (image/iframe/none), opacity, and border/background colours. Returns the
 * updated BoardConfig; the parent persists it with the board record.
 */
export function BoardSettingsDialog({
  config,
  onClose,
  onSave,
}: BoardSettingsDialogProps) {
  // Normalise opacity to a 0–1 fraction on load so the edit round-trips
  // cleanly regardless of how the loaded record stored it.
  const [draft, setDraft] = useState<BoardConfig>({
    ...config,
    backgroundOpacity: normalizeOpacity(config.backgroundOpacity),
  })
  const [bgKind, setBgKind] = useState<BgKind>(
    config.backgroundType === "iframe"
      ? "iframe"
      : config.backgroundImage
        ? "image"
        : "none",
  )
  const [bgPreview, setBgPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<BoardConfig>) => setDraft((d) => ({ ...d, ...patch }))

  const handleBgFile = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const blob = await uploadBlob(file)
      set({
        backgroundImage: {
          $type: "org.hypercerts.defs#smallImage",
          image: blob as never,
        },
      })
      setBgPreview(URL.createObjectURL(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Background upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = () => {
    const next: BoardConfig = { ...draft }
    if (bgKind === "none") {
      next.backgroundType = undefined
      next.backgroundImage = undefined
      next.backgroundIframeUrl = undefined
    } else if (bgKind === "image") {
      next.backgroundType = "image"
      next.backgroundIframeUrl = undefined
    } else {
      next.backgroundType = "iframe"
      next.backgroundImage = undefined
    }
    onSave(next)
  }

  return (
    <FormDialog
      title="Board settings"
      onClose={onClose}
      onSubmit={handleSubmit}
      isSubmitting={uploading}
      submitLabel="Save"
      maxWidth={460}
    >
      <label className="mb-1 block text-body-sm font-medium text-[var(--fg-primary)]">
        Aspect ratio
      </label>
      <SegmentedControl
        aria-label="Aspect ratio"
        value={draft.aspectRatio ?? "16:9"}
        onValueChange={(v) => set({ aspectRatio: v as BoardConfig["aspectRatio"] })}
        options={[
          { value: "16:9", label: "16:9" },
          { value: "4:3", label: "4:3" },
          { value: "1:1", label: "1:1" },
        ]}
      />

      <label className="mb-1 mt-4 block text-body-sm font-medium text-[var(--fg-primary)]">
        Image shape
      </label>
      <SegmentedControl
        aria-label="Image shape"
        value={draft.imageShape ?? "circular"}
        onValueChange={(v) => set({ imageShape: v as BoardConfig["imageShape"] })}
        options={[
          { value: "circular", label: "Circular" },
          { value: "square", label: "Square" },
        ]}
      />

      <label className="mb-1 mt-4 block text-body-sm font-medium text-[var(--fg-primary)]">
        Background
      </label>
      <SegmentedControl
        aria-label="Background type"
        value={bgKind}
        onValueChange={(v) => setBgKind(v as BgKind)}
        options={[
          { value: "none", label: "None" },
          { value: "image", label: "Image" },
          { value: "iframe", label: "Iframe" },
        ]}
      />

      {bgKind === "image" ? (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleBgFile(f)
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {bgPreview || draft.backgroundImage ? "Change background" : "Upload background"}
          </Button>
        </div>
      ) : null}

      {bgKind === "iframe" ? (
        <div className="mt-3">
          <Input
            label="Iframe URL"
            placeholder="https://…"
            value={draft.backgroundIframeUrl ?? ""}
            onChange={(e) => set({ backgroundIframeUrl: e.target.value })}
          />
        </div>
      ) : null}

      {bgKind !== "none" ? (
        <div className="mt-3">
          <Input
            label="Background opacity (%)"
            type="number"
            min={0}
            max={100}
            value={String(Math.round(normalizeOpacity(draft.backgroundOpacity) * 100))}
            onChange={(e) => {
              const pct = Math.max(0, Math.min(100, parseInt(e.target.value || "0", 10)))
              // Store as a 0–1 fraction (matches the de-facto hyperboards data).
              set({ backgroundOpacity: pct / 100 })
            }}
          />
          <label className="mt-2 flex items-center gap-2 text-body-sm text-[var(--fg-primary)]">
            <input
              type="checkbox"
              checked={draft.backgroundGrayscale !== false}
              onChange={(e) => set({ backgroundGrayscale: e.target.checked })}
            />
            Grayscale background
          </label>
        </div>
      ) : null}

      <label className="mt-4 flex items-center gap-2 text-body-sm text-[var(--fg-primary)]">
        <input
          type="checkbox"
          checked={draft.grayscaleImages === true}
          onChange={(e) => set({ grayscaleImages: e.target.checked })}
        />
        Grayscale contributor images
      </label>

      <div className="mt-4 flex gap-6">
        <label className="flex items-center gap-2 text-body-sm text-[var(--fg-primary)]">
          Border
          <input
            type="color"
            value={draft.borderColor || COLOR_SEED}
            onChange={(e) => set({ borderColor: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-body-sm text-[var(--fg-primary)]">
          Background
          <input
            type="color"
            value={draft.backgroundColor || COLOR_SEED}
            onChange={(e) => set({ backgroundColor: e.target.value })}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 text-body-sm text-[var(--color-error)]">{error}</p>
      ) : null}
    </FormDialog>
  )
}

export default BoardSettingsDialog
