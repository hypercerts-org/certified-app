"use client"

import { useRef, useState } from "react"
import { Camera, X } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"

interface ImageEditOverlayProps {
  /** Upload handler. Receives the picked file, returns when the
   *  blob has been written. Throws / rejects on failure. */
  readonly onFile: (file: File) => Promise<void>
  /** True after a fresh image is staged but not yet saved. The
   *  Change pill label flips to "Replace image" so the user knows
   *  re-uploading replaces the pending one, not the persisted one. */
  readonly hasPending: boolean
  /** "single" — Change pill only (cert detail's 1:1 thumb).
   *  "with-remove" — Change pill PLUS a Remove pill (project hero's
   *  wide banner, where the corner pill would otherwise feel
   *  decorative; see issue #67 review B6). The Remove handler is
   *  required when this variant is selected. */
  readonly variant?: "single" | "with-remove"
  /** Required when `variant === "with-remove"`. Drops the image
   *  from the record on save. Called optimistically by the overlay
   *  (no internal busy state — the parent handles the post-save
   *  refresh). */
  readonly onRemove?: () => void
  /** True when the record currently has an image (so the Remove
   *  pill should be enabled). Only consulted in the `with-remove`
   *  variant. */
  readonly hasImage?: boolean
}

/**
 * Shared image-edit affordance used by record detail surfaces in
 * inline-edit mode. Renders one or two semi-transparent pill
 * buttons anchored to the bottom-right of the parent. The parent
 * must be `position: relative`; the dashed-outline `--editing`
 * treatment is the parent's responsibility.
 *
 * Two visual variants:
 *   - `single`     — Change pill only. Used on cert detail's 1:1
 *                    square image where a single 32px pill in the
 *                    corner reads as the obvious edit affordance.
 *   - `with-remove` — Change + Remove cluster. Used on project
 *                    detail's wide hero where a singleton pill
 *                    1200px from the title gets visually lost
 *                    (see issue #67 review B6 — matches the
 *                    profile BannerUpload two-pill pattern).
 *
 * The Remove pill in `with-remove` mode is disabled when there's
 * no image to remove yet.
 */
export default function ImageEditOverlay({
  onFile,
  hasPending,
  variant = "single",
  onRemove,
  hasImage = false,
}: ImageEditOverlayProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleClick = () => inputRef.current?.click()
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return
    setIsUploading(true)
    try {
      await onFile(file)
    } finally {
      setIsUploading(false)
    }
  }

  // Three label states: "Add image" when the slot is empty (no
  // saved record-image AND no pending blob), "Replace image" while
  // a fresh upload is staged but not saved, "Change image" otherwise.
  // The Add/Change distinction tells a first-time author that this
  // is the upload affordance (not just an edit on an existing image).
  const isEmpty = !hasImage && !hasPending
  const changeLabel = hasPending
    ? "Replace image"
    : hasImage
      ? "Change image"
      : "Add image"
  // Remove pill only renders in the with-remove variant AND when
  // there's actually something to remove (saved image or pending
  // upload). The pre-upload empty state shouldn't carry a Remove
  // affordance at all — there's nothing to delete.
  const showRemove =
    variant === "with-remove" && !!onRemove && !isEmpty
  // Wrap in a row when we have multiple pills so they cluster
  // together visually instead of stacking at the same corner.
  const wrapperClass = showRemove
    ? "image-edit-overlay image-edit-overlay--with-remove"
    : "image-edit-overlay"

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        className="image-edit-overlay__btn"
        onClick={handleClick}
        aria-label={isUploading ? "Uploading image" : changeLabel}
        title={changeLabel}
        disabled={isUploading}
      >
        {isUploading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <>
            <Camera size={14} strokeWidth={1.75} aria-hidden />
            <span>{changeLabel}</span>
          </>
        )}
      </button>
      {showRemove ? (
        <button
          type="button"
          className="image-edit-overlay__btn image-edit-overlay__btn--ghost"
          onClick={onRemove}
          aria-label="Remove image"
          title="Remove image"
          disabled={isUploading}
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
          <span>Remove</span>
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        onChange={handleChange}
        className="image-edit-overlay__input"
      />
    </div>
  )
}
