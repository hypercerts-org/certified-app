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
  // The parent page owns the object-URL preview (see profile page's
  // pendingBannerPreviewUrl). We just render whatever URL it passes in
  // via `currentBannerUrl` — which already reflects the picked file
  // synchronously — and report whether that image came from a fresh
  // pick (via `hasPending`) so the button label can swap to "Replace".
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [hasPending, setHasPending] = useState(false);
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

    try {
      await onUpload(file);
      setHasPending(true);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    }

    e.target.value = "";
  };

  const displayUrl = currentBannerUrl;
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
        ) : null}

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
                <span className="profile-banner-upload__btn-label">
                  {hasPending ? "Replace banner" : "Change banner"}
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
