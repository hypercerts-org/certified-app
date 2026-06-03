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
  // Shared button chrome (mirrors `.edit-banner__btn` in profile-inline-edit.css).
  const btnBase =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3.5 font-[inherit] text-[0.8125rem] font-medium leading-none text-[var(--fg-primary)] cursor-pointer transition-[background-color,border-color] duration-150 ease-out enabled:hover:bg-[var(--overlay-weak)] disabled:cursor-not-allowed disabled:opacity-60"
  // Primary modifier (`.edit-banner__btn--primary`): dark fill that stays dark on
  // hover (opacity affordance), re-pinning bg + border so the ghost-hover rule
  // above can't repaint it near-white.
  const btnPrimary =
    "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border-[var(--btn-primary-bg)] enabled:hover:bg-[var(--btn-primary-bg)] enabled:hover:border-[var(--btn-primary-bg)] enabled:hover:opacity-[0.92]"

  // `edit-banner` class retained on the root only as the hook for the profile
  // inline-edit click guard (`target.closest(".edit-banner")` in
  // use-profile-inline-edit.ts). The look below is self-contained Tailwind
  // mirroring the `.edit-banner*` rules in profile-inline-edit.css.
  return (
    <div
      className="edit-banner mx-6 mt-4 flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-2.5"
      role="region"
      aria-label={label}
    >
      <span className="font-[var(--font-inter),system-ui,sans-serif] text-[0.8125rem] font-semibold tracking-[0.01em] text-[var(--fg-primary)]">
        {label}
      </span>
      {error ? (
        <span
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.8125rem] text-[var(--color-error)]"
          role="alert"
        >
          {error}
        </span>
      ) : null}
      <div className="ml-auto inline-flex items-center gap-2">
        <button
          type="button"
          className={btnBase}
          onClick={onCancel}
          disabled={isSaving}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`${btnBase} ${btnPrimary}`}
          onClick={onSave}
          disabled={isSaving || !canSave}
        >
          {isSaving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  )
}
