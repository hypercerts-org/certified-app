"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Button from "@/components/ui/button"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import { safeHttpUrl } from "@/lib/utils/safe-url"

export interface LinkDialogResult {
  /** Final URL — empty string means "remove the link". */
  url: string
  /**
   * Display text. Only meaningful when the caller opened the dialog
   * with no text selected — the editor inserts a new text node with
   * this label. When text was selected, this is the same as the
   * selected text and the caller can ignore it.
   */
  text: string
}

export interface LinkDialogProps {
  /** Title is dynamic so we can swap between "Add link" / "Edit link". */
  title?: string
  /** Initial URL value — prefilled when editing an existing link. */
  initialUrl?: string
  /** Initial display-text value — only used when `allowTextEdit` is true. */
  initialText?: string
  /** True when the editor had no selection — show a Text field so the
   *  user can type the label that the link should display. */
  allowTextEdit: boolean
  onClose: () => void
  onConfirm: (result: LinkDialogResult) => void
}

/**
 * Site-styled replacement for `window.prompt("Link URL")`. Used by
 * `<LeafletEditor>` when the user clicks the Link toolbar button.
 *
 * When `allowTextEdit` is true the dialog renders a second "Text"
 * input so a user with no selection can type both the URL and the
 * label the link should display. With a selection the text is fixed
 * (the selected content) and only the URL field is rendered.
 */
export default function LinkDialog({
  title,
  initialUrl = "",
  initialText = "",
  allowTextEdit,
  onClose,
  onConfirm,
}: LinkDialogProps) {
  const urlInputRef = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState(initialUrl)
  const [text, setText] = useState(initialText)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Autofocus the URL field on open — the user almost always wants
  // to type a URL first. AppDialog handles the showModal()/close
  // lifecycle; this only owns the autofocus piece.
  useEffect(() => {
    requestAnimationFrame(() => urlInputRef.current?.focus())
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      // React synthetic events bubble through the React tree, not
      // the DOM tree, so even though this dialog is portalled to
      // document.body its submit still bubbles up through the
      // LeafletEditor's parent <form> on /create and /project/new
      // (the editor IS rendered inside that form in the React
      // tree). Without stopPropagation the outer form's submit
      // fires too and publishes the cert / project the moment the
      // user clicks "Add link".
      e.stopPropagation()
      const trimmed = url.trim()
      // Reject non-http(s) URLs at the boundary. The editor and
      // renderer also defend, but failing here gives the user an
      // immediate, actionable message instead of silently dropping
      // their link.
      if (trimmed !== "" && safeHttpUrl(trimmed) === null) {
        setSubmitError("Use a full http:// or https:// URL.")
        return
      }
      setSubmitError(null)
      onConfirm({ url: trimmed, text: text.trim() })
    },
    [onConfirm, url, text],
  )

  const isEdit = initialUrl.length > 0
  const resolvedTitle = title ?? (isEdit ? "Edit link" : "Add link")

  return (
    <AppDialog ariaLabel={resolvedTitle} maxWidth={440} onClose={onClose}>
      <AppDialogHeader title={resolvedTitle} onClose={onClose} />
      <form className="signin-modal__body" onSubmit={handleSubmit}>
        <label className="link-dialog__field">
          <span className="link-dialog__label">URL</span>
          <input
            ref={urlInputRef}
            type="url"
            inputMode="url"
            className="link-dialog__input"
            value={url}
            placeholder="https://example.com"
            onChange={(e) => setUrl(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>

        {submitError ? (
          <p className="link-dialog__error" role="alert">
            {submitError}
          </p>
        ) : null}

        {allowTextEdit ? (
          <label className="link-dialog__field">
            <span className="link-dialog__label">Text (optional)</span>
            <input
              type="text"
              className="link-dialog__input"
              value={text}
              placeholder="Link label"
              onChange={(e) => setText(e.target.value)}
            />
            <span className="link-dialog__hint">
              Leave blank to show the URL as the link text.
            </span>
          </label>
        ) : null}

        <div className="link-dialog__actions">
          {isEdit ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onConfirm({ url: "", text: "" })}
            >
              Remove link
            </Button>
          ) : null}
          <div className="link-dialog__actions-right">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={url.trim() === ""}>
              {isEdit ? "Update" : "Add link"}
            </Button>
          </div>
        </div>
      </form>
    </AppDialog>
  )
}
