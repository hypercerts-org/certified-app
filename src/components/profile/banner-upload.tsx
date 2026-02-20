"use client";

import React, { useState, useRef } from "react";
import { Image as ImageIcon } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

export interface BannerUploadProps {
  currentBannerUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

const BannerUpload: React.FC<BannerUploadProps> = ({
  currentBannerUrl,
  onUpload,
  isUploading,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
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
      setError("Image must be 10MB or smaller");
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

  const displayUrl = previewUrl || currentBannerUrl;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full h-48 rounded-xl overflow-hidden cursor-pointer"
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Banner image or placeholder */}
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Profile banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}

        {/* Overlay */}
        {(isHovered || isUploading) && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center gap-2">
            {isUploading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <ImageIcon className="h-6 w-6 text-white" />
                <span className="text-white font-medium">Change banner</span>
              </>
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
        <p className="text-caption text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};

export default BannerUpload;
