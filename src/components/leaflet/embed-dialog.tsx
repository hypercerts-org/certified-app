"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { X } from "lucide-react"
import Button from "@/components/ui/button"
import AppDialog from "@/components/ui/app-dialog"
import { normaliseEmbedUrl } from "@/lib/leaflet/embed-url"

export interface EmbedDialogResult {
  url: string
  aspectRatio: { width: number; height: number }
}

export interface EmbedDialogProps {
  initialUrl?: string
  onCancel: () => void
  onConfirm: (result: EmbedDialogResult) => void
}

/**
 * Site-styled URL input for embedding a video (YouTube / Vimeo).
 * Validates the URL against `normaliseEmbedUrl` and only enables
 * the confirm button when the input matches a recognised provider.
 */
export default function EmbedDialog({
  initialUrl = "",
  onCancel,
  onConfirm,
}: EmbedDialogProps) {
  const urlInputRef = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState(initialUrl)
  const normalised = normaliseEmbedUrl(url)
  const isValid = normalised !== null

  useEffect(() => {
    requestAnimationFrame(() => urlInputRef.current?.focus())
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!normalised) return
      onConfirm({
        url: normalised.embedUrl,
        aspectRatio: normalised.aspectRatio,
      })
    },
    [normalised, onConfirm],
  )

  return (
    <AppDialog ariaLabel="Embed video" maxWidth={440} onClose={onCancel}>
      <div className="signin-modal__header">
        <span className="signin-modal__title">Embed video</span>
        <button
          type="button"
          className="signin-modal__close"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
      <form className="signin-modal__body" onSubmit={handleSubmit}>
        <label className="link-dialog__field">
          <span className="link-dialog__label">YouTube or Vimeo URL</span>
          <input
            ref={urlInputRef}
            type="url"
            inputMode="url"
            className="link-dialog__input"
            value={url}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => setUrl(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <span className="link-dialog__hint">
            {url.length === 0
              ? "Paste a YouTube or Vimeo URL — we'll convert it to an embed."
              : isValid
                ? `Recognised as ${normalised.provider}.`
                : "Doesn't look like a supported YouTube or Vimeo URL."}
          </span>
        </label>

        <div className="link-dialog__actions">
          <div className="link-dialog__actions-right">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!isValid}>
              Embed
            </Button>
          </div>
        </div>
      </form>
    </AppDialog>
  )
}
