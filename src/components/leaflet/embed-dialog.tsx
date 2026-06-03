"use client"

import { useRef, useState } from "react"
import FormDialog from "@/components/ui/form-dialog"
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
 *
 * FormDialog owns the AppDialog chrome, header, body <form>, the
 * submit preventDefault + stopPropagation guard (so the inner submit
 * doesn't bubble through the React tree to the LeafletEditor's parent
 * <form> on /create and /project/new and publish the cert/project),
 * and the standardized Cancel/Submit footer.
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

  return (
    <FormDialog
      title="Embed video"
      onClose={onCancel}
      onSubmit={() => {
        if (!normalised) return
        onConfirm({
          url: normalised.embedUrl,
          aspectRatio: normalised.aspectRatio,
        })
      }}
      canSubmit={isValid}
      submitLabel="Embed"
      autoFocusFirst
      initialFocusRef={urlInputRef}
    >
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
    </FormDialog>
  )
}
