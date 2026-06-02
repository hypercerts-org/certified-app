"use client"

import React from "react"

/**
 * Shared "Editing ..." banner that sits above an inline-edit
 * surface (profile page, cert detail, etc.) with Cancel + Save
 * actions to the right and an optional inline error label.
 *
 * Single source of truth so every surface that goes into inline
 * edit mode lands the banner at the same offset, with the same
 * chrome and the same sticky behaviour.
 *
 * Position rules live on the `.edit-banner` class in
 * `styles/profile-inline-edit.css` (sticky-under-top-bar with
 * 24px lateral margin). The profile page's inline-edit click
 * guard also keys on this class.
 */

export interface EditBannerProps {
  /** Lead label, e.g. "Editing profile" / "Editing cert". */
  label: string
  /** Inline error message (right of label). Pass null to hide. */
  error?: string | null
  /** True while a save is in flight — disables both buttons and
   *  swaps the Save label to "Saving…". */
  isSaving?: boolean
  /** When false, disables only the Save button (Cancel stays
   *  active). Use for form-level validation gates — e.g. a
   *  duplicate contributor on the cert editor — so the affordance
   *  reads as "can't save yet" rather than silently no-op'ing. */
  canSave?: boolean
  /** Cancel handler. Should revert in-flight drafts. */
  onCancel: () => void
  /** Save handler. */
  onSave: () => void
  /** Override the Save / Cancel button labels. */
  saveLabel?: string
  cancelLabel?: string
}

export default function EditBanner({
  label,
  error = null,
  isSaving = false,
  canSave = true,
  onCancel,
  onSave,
  saveLabel = "Save",
  cancelLabel = "Cancel",
}: EditBannerProps) {
  return (
    <div className="edit-banner" role="region" aria-label={label}>
      <span className="edit-banner__label">{label}</span>
      {error ? (
        <span className="edit-banner__error" role="alert">
          {error}
        </span>
      ) : null}
      <div className="edit-banner__actions">
        <button
          type="button"
          className="edit-banner__btn"
          onClick={onCancel}
          disabled={isSaving}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="edit-banner__btn edit-banner__btn--primary"
          onClick={onSave}
          disabled={isSaving || !canSave}
        >
          {isSaving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  )
}
