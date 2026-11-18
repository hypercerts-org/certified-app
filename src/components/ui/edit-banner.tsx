"use client"

import React from "react"
import Button from "@/components/ui/button"

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
  /** Error message, under the label (it wraps). Pass null to hide. */
  error?: string | null
  /** True while a save is in flight — disables both buttons and
   *  swaps the Save label to "Saving…". */
  isSaving?: boolean
  /** When false, disables only the Save button (Cancel stays
   *  active). Forms keep Save enabled and explain what's missing on
   *  click (DESIGN.md §9.2 validation timing); this is for a save that
   *  can't run at all. */
  canSave?: boolean
  /** Cancel handler. Should revert in-flight drafts. */
  onCancel: () => void
  /** Save handler. */
  onSave: () => void
  /** Override the Save / Cancel button labels ("Save changes" /
   *  "Cancel" by default). */
  saveLabel?: string
  cancelLabel?: string
  /** Extra class on the banner root — lets a surface constrain the
   *  banner's width to its own reading column (e.g. the project editor
   *  caps it to match the centered article). Appended after the base
   *  layout classes. */
  className?: string
}

export default function EditBanner({
  label,
  error = null,
  isSaving = false,
  canSave = true,
  onCancel,
  onSave,
  saveLabel = "Save changes",
  cancelLabel = "Cancel",
  className = "",
}: EditBannerProps) {
  // `edit-banner` class retained on the root as the hook for the profile
  // inline edit's unsaved-changes guard (links inside it navigate without
  // asking; use-profile-inline-edit.ts). The look is self-contained
  // Tailwind; the buttons are the Button primitive at `sm` (32px from
  // 800px, 44px on phones). The error wraps under the label rather than
  // being cut to one line.
  return (
    <div
      className={`edit-banner mx-6 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-2.5${className ? ` ${className}` : ""}`}
      role="region"
      aria-label={label}
    >
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <span className="text-ui font-semibold text-[var(--fg-primary)]">
          {label}
        </span>
        {error ? (
          <p
            className="m-0 text-ui text-pretty text-[var(--color-error)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
      <div className="ml-auto inline-flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          loading={isSaving}
          disabled={isSaving || !canSave}
        >
          {isSaving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  )
}
