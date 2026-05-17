"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { X } from "lucide-react"
import Button from "@/components/ui/button"

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
  onCancel: () => void
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
  onCancel,
  onConfirm,
}: LinkDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const [url, setUrl] = useState(initialUrl)
  const [text, setText] = useState(initialText)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    // Autofocus the URL field on open — the user almost always
    // wants to type a URL first.
    requestAnimationFrame(() => urlInputRef.current?.focus())

    const handleClose = () => onCancel()
    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onCancel])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onCancel()
    },
    [onCancel],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      onConfirm({ url: url.trim(), text: text.trim() })
    },
    [onConfirm, url, text],
  )

  const isEdit = initialUrl.length > 0
  const resolvedTitle = title ?? (isEdit ? "Edit link" : "Add link")

  return (
    <dialog
      ref={dialogRef}
      className="signin-modal"
      role="dialog"
      aria-label={resolvedTitle}
      onClick={handleBackdropClick}
      style={{ maxWidth: 440 }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <div className="signin-modal__header">
          <span className="signin-modal__title">{resolvedTitle}</span>
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
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={url.trim() === ""}>
                {isEdit ? "Update" : "Add link"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </dialog>
  )
}
