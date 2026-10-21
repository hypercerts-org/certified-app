"use client";

import React, { useState, useRef } from "react";
import { Camera } from "lucide-react";
import Avatar from "@/components/ui/avatar";
import LoadingSpinner from "@/components/ui/loading-spinner";

export interface AvatarUploadProps {
  currentAvatarUrl: string | null;
  fallbackInitials: string;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatarUrl,
  fallbackInitials,
  onUpload,
  isUploading,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — Vercel serverless limit is ~4.5MB
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please select a JPEG, PNG, or WebP image");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be 4MB or smaller");
      return;
    }

    // Create preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Upload
    try {
      await onUpload(file);
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      // Clear preview on error
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    }

    // Reset file input
    e.target.value = "";
  };

  // Clean up preview URL on unmount
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* A real <button>: keyboard / touch users get the same affordance.
          The camera overlay shows on hover AND keyboard focus; touch
          devices (no hover) get a persistent camera badge instead. */}
      <button
        type="button"
        className="group relative cursor-pointer rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait"
        aria-label="Upload avatar"
        onClick={handleClick}
        disabled={isUploading}
      >
        {/* Avatar */}
        <span className="block h-16 w-16">
          <Avatar
            src={displayUrl || undefined}
            fallbackInitials={fallbackInitials}
            size="lg"
          />
        </span>

        {/* Overlay */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full bg-[var(--navy-overlay-70)] flex items-center justify-center transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100 ${
            isUploading ? "opacity-100" : "opacity-0"
          }`}
        >
          {isUploading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <Camera className="h-8 w-8 text-[var(--color-white)]" />
          )}
        </span>

        {/* Touch-only camera badge (no hover to reveal the overlay). */}
        {!isUploading ? (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 hidden h-6 w-6 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)] [@media_not_all_and_(hover:hover)_and_(pointer:fine)]:flex"
          >
            <Camera className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </button>

      {/* Hidden file input (outside the button — no nested controls) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
        tabIndex={-1}
        aria-hidden
      />

      {/* Error message */}
      {error && (
        <p role="alert" className="text-caption text-[var(--color-error)] text-center max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
};

export default AvatarUpload;
