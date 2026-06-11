"use client";

import React, { useState, useRef } from "react";
import { Camera, Trash2 } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

export interface BannerUploadProps {
  currentBannerUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  /** When provided AND a banner image is currently set, a "Remove"
   *  pill renders next to the "Change banner" button. Clicking it
   *  clears the banner from the draft so save persists no banner. */
  onRemove?: () => void;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — Vercel serverless limit is ~4.5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Banner upload control. Mirrors `AvatarEditOverlay` in the sidebar:
 * always renders a floating "Change banner" button in the corner so
 * the affordance is the same regardless of whether a banner image is
 * present or not. The button itself opens the file picker; the rest
 * of the banner box is decorative (no whole-area click target, which
 * matches the avatar behaviour and avoids the rect-click vs.
 * pill-click inconsistency the user flagged).
 */
const BannerUpload: React.FC<BannerUploadProps> = ({
  currentBannerUrl,
  onUpload,
  isUploading,
  onRemove,
}) => {
  // Self-preview the picked file (mirrors AvatarUpload): create an
  // object URL on pick so the banner area shows the chosen image
  // immediately, falling back to `currentBannerUrl` (the saved record)
  // when nothing has been picked. The displayed image (`displayUrl` /
  // `hasImage`) is the single source of truth — the button label and
  // Remove pill derive from it, so they can't desync the way the old
  // write-once `hasPending` boolean did.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please select a JPEG, PNG, or WebP image");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be 4MB or smaller");
      return;
    }

    // Optimistic preview — show the picked file before/while it uploads.
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      await onUpload(file);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      // Clear preview on error so the stale/saved banner shows again.
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    }

    e.target.value = "";
  };

  // Clean up the preview URL on unmount.
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // When the parent's banner reference changes — e.g. the inline-edit
  // flow's Remove clears `currentBannerUrl` to null, or the saved record
  // refetches a new URL — release the local preview so the displayed
  // image follows the parent's truth instead of pinning the now-stale
  // picked file. (Mirrors the parent hook's quality-036 mirror-clear.)
  React.useEffect(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [currentBannerUrl]);

  const displayUrl = previewUrl || currentBannerUrl;
  const hasImage = !!displayUrl && !imgFailed;

  React.useEffect(() => {
    setImgFailed(false);
  }, [displayUrl]);

  return (
    <div className="profile-banner-upload">
      <div
        className={
          "profile-banner-upload__box" +
          (hasImage ? "" : " profile-banner-upload__box--empty")
        }
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl!}
            alt="Profile banner"
            className="profile-banner-upload__img"
            onError={() => setImgFailed(true)}
          />
        ) : (
          // Neutral guidance hint for the otherwise-featureless empty
          // box. Sets reader expectations (what the banner is, the crop)
          // instead of leaving a blank gradient rectangle. aria-hidden:
          // the "Change banner" button already carries the accessible
          // affordance, so the hint is decorative for screen readers.
          <span className="profile-banner-upload__hint" aria-hidden="true">
            Add a banner image — shown across the top of your profile (3:1)
          </span>
        )}

        <div className="profile-banner-upload__btn-row">
          <button
            type="button"
            className="profile-banner-upload__btn"
            onClick={handleClick}
            aria-label={isUploading ? "Uploading banner" : "Change banner"}
            title={isUploading ? "Uploading…" : "Change banner"}
            disabled={isUploading}
          >
            {isUploading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <Camera size={16} strokeWidth={1.75} aria-hidden />
                {/* Label is derived straight from the displayed image
                    (the single source of truth): "Replace" while a
                    banner is shown, "Change" when the box is empty. This
                    can't desync the way the old write-once `hasPending`
                    boolean did, which stayed stuck at "Replace" after
                    the parent cleared the banner (inline-edit Remove). */}
                <span className="profile-banner-upload__btn-label">
                  {hasImage ? "Replace banner" : "Change banner"}
                </span>
              </>
            )}
          </button>
          {hasImage && onRemove && !isUploading ? (
            <button
              type="button"
              className="profile-banner-upload__btn profile-banner-upload__btn--ghost"
              onClick={onRemove}
              aria-label="Remove banner"
              title="Remove banner"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              <span className="profile-banner-upload__btn-label">Remove</span>
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="profile-banner-upload__input"
          disabled={isUploading}
        />
      </div>

      {error && (
        <p role="alert" className="profile-banner-upload__error">
          {error}
        </p>
      )}
    </div>
  );
};

export default BannerUpload;
