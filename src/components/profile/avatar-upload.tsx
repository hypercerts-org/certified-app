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
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
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
      setError("Image must be 5MB or smaller");
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
      <div
        className="relative cursor-pointer"
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Avatar */}
        <div className="h-24 w-24">
          <Avatar
            src={displayUrl || undefined}
            fallbackInitials={fallbackInitials}
            size="xl"
          />
        </div>

        {/* Overlay */}
        {(isHovered || isUploading) && (
          <div className="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center">
            {isUploading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <Camera className="h-8 w-8 text-white" />
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="text-caption text-red-600 text-center max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
};

export default AvatarUpload;
