"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import Button from "@/components/ui/button";
import ErrorMessage from "@/components/ui/error-message";
import AvatarUpload from "@/components/profile/avatar-upload";
import BannerUpload from "@/components/profile/banner-upload";
import type { CertifiedProfile, HypercertsSmallImage, HypercertsLargeImage } from "@/lib/atproto/types";

export interface ProfileEditFormProps {
  initialProfile: CertifiedProfile | null;
  onSave: (profile: CertifiedProfile) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  onAvatarUpload: (file: File) => Promise<Record<string, unknown>>;
  onBannerUpload: (file: File) => Promise<Record<string, unknown>>;
  currentAvatarUrl: string | null;
  currentBannerUrl: string | null;
  fallbackInitials: string;
}

const ProfileEditForm: React.FC<ProfileEditFormProps> = ({
  initialProfile,
  onSave,
  isSaving,
  saveError,
  onAvatarUpload,
  onBannerUpload,
  currentAvatarUrl,
  currentBannerUrl,
  fallbackInitials,
}) => {
  const router = useRouter();

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");

  // Image upload state
  const [avatarBlob, setAvatarBlob] = useState<Record<string, unknown> | null>(null);
  const [bannerBlob, setBannerBlob] = useState<Record<string, unknown> | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  // Validation errors
  const [displayNameError, setDisplayNameError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [websiteError, setWebsiteError] = useState("");

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with profile data
  useEffect(() => {
    if (initialProfile) {
      setDisplayName(initialProfile.displayName || "");
      setDescription(initialProfile.description || "");
      setWebsite(initialProfile.website || "");
    }
  }, [initialProfile]);

  // Track changes
  useEffect(() => {
    const changed =
      displayName !== (initialProfile?.displayName || "") ||
      description !== (initialProfile?.description || "") ||
      website !== (initialProfile?.website || "") ||
      avatarBlob !== null ||
      bannerBlob !== null;
    setHasChanges(changed);
  }, [displayName, description, website, initialProfile, avatarBlob, bannerBlob]);

  // Validate display name
  const validateDisplayName = (value: string) => {
    if (value.length > 64) {
      setDisplayNameError("Display name must be 64 characters or fewer");
      return false;
    }
    setDisplayNameError("");
    return true;
  };

  // Validate description
  const validateDescription = (value: string) => {
    if (value.length > 256) {
      setDescriptionError("Description must be 256 characters or fewer");
      return false;
    }
    setDescriptionError("");
    return true;
  };

  // Validate website
  const validateWebsite = (value: string) => {
    if (value.trim() === "") {
      setWebsiteError("");
      return true;
    }
    try {
      new URL(value);
      setWebsiteError("");
      return true;
    } catch {
      setWebsiteError("Please enter a valid URL");
      return false;
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      const blobRef = await onAvatarUpload(file);
      setAvatarBlob(blobRef);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle banner upload
  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true);
    try {
      const blobRef = await onBannerUpload(file);
      setBannerBlob(blobRef);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // Handle field changes with validation
  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDisplayName(value);
    validateDisplayName(value);
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value = e.target.value;
    setDescription(value);
    validateDescription(value);
  };

  const handleWebsiteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWebsite(value);
    validateWebsite(value);
  };

  // Check if form is valid
  const isValid =
    !displayNameError &&
    !descriptionError &&
    !websiteError;

  // Handle save
  const handleSave = async () => {
    // Re-validate all fields
    const displayNameValid = validateDisplayName(displayName);
    const descriptionValid = validateDescription(description);
    const websiteValid = validateWebsite(website);

    if (!displayNameValid || !descriptionValid || !websiteValid) {
      return;
    }

    // Construct profile
    const profile: CertifiedProfile = {
      // Set createdAt: use existing or new
      createdAt: initialProfile?.createdAt || new Date().toISOString(),
      // Add text fields (trim and omit empty strings)
      ...(displayName.trim() && { displayName: displayName.trim() }),
      ...(description.trim() && { description: description.trim() }),
      ...(website.trim() && { website: website.trim() }),
    };

    // Handle avatar: use new blob if uploaded, otherwise preserve existing
    if (avatarBlob) {
      const avatarImage: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        image: avatarBlob as any,
      };
      profile.avatar = avatarImage;
    } else if (initialProfile?.avatar) {
      profile.avatar = initialProfile.avatar;
    }

    // Handle banner: use new blob if uploaded, otherwise preserve existing
    if (bannerBlob) {
      const bannerImage: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        image: bannerBlob as any,
      };
      profile.banner = bannerImage;
    } else if (initialProfile?.banner) {
      profile.banner = initialProfile.banner;
    }

    await onSave(profile);
  };

  // Handle cancel
  const handleCancel = () => {
    router.push("/");
  };

  return (
    <div>
      <h1 className="font-serif text-h1 text-black mb-6">Edit Profile</h1>

      <div className="bg-white border border-gray-100 rounded-sm">
        <div className="flex flex-col gap-6 p-6">
          {/* Banner Upload */}
          <BannerUpload
            currentBannerUrl={currentBannerUrl}
            onUpload={handleBannerUpload}
            isUploading={isUploadingBanner}
          />

          {/* Avatar Upload */}
          <div className="flex justify-center -mt-12">
            <AvatarUpload
              currentAvatarUrl={currentAvatarUrl}
              fallbackInitials={fallbackInitials}
              onUpload={handleAvatarUpload}
              isUploading={isUploadingAvatar}
            />
          </div>

          {/* Display Name */}
          <div className="border-t border-gray-100 pt-6">
            <Input
              label="Display name"
              value={displayName}
              onChange={handleDisplayNameChange}
              maxLength={640}
              placeholder="Your display name"
              error={displayNameError}
            />
          </div>

          {/* Description */}
          <div>
            <Textarea
              label="About"
              value={description}
              onChange={handleDescriptionChange}
              rows={4}
              maxLength={2560}
              placeholder="Tell us about yourself"
              error={descriptionError}
            />
            <div className="font-sans text-xs text-gray-400 text-right mt-1">
              {description.length}/256 characters
            </div>
          </div>

          {/* Website */}
          <Input
            label="Website"
            type="url"
            value={website}
            onChange={handleWebsiteChange}
            maxLength={2560}
            placeholder="https://example.com"
            error={websiteError}
          />

          {/* Save error */}
          {saveError && (
            <ErrorMessage message={saveError} />
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
            <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
              disabled={!hasChanges || !isValid || isSaving}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditForm;
