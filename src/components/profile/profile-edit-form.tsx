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
import type { UploadedBlob } from "@/lib/atproto/profile";
import type { BlobRef } from "@atproto/api";

export interface ProfileEditFormProps {
  initialProfile: CertifiedProfile | null;
  onSave: (profile: CertifiedProfile) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  onAvatarUpload: (file: File) => Promise<UploadedBlob>;
  onBannerUpload: (file: File) => Promise<UploadedBlob>;
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
  const [avatarBlob, setAvatarBlob] = useState<UploadedBlob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<UploadedBlob | null>(null);
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

  // Validate website. Only http: and https: are accepted — a `javascript:`
  // URL parses fine via `new URL()` and would otherwise be planted as XSS
  // on any visitor who clicks the link.
  const validateWebsite = (value: string) => {
    if (value.trim() === "") {
      setWebsiteError("");
      return true;
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setWebsiteError("URL must start with http:// or https://");
        return false;
      }
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
        // UploadedBlob is structurally compatible with the lexicon's
        // BlobRef shape — narrow with a single cast at this seam.
        image: avatarBlob as unknown as BlobRef,
      };
      profile.avatar = avatarImage;
    } else if (initialProfile?.avatar) {
      profile.avatar = initialProfile.avatar;
    }

    // Handle banner: use new blob if uploaded, otherwise preserve existing
    if (bannerBlob) {
      const bannerImage: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        image: bannerBlob as unknown as BlobRef,
      };
      profile.banner = bannerImage;
    } else if (initialProfile?.banner) {
      profile.banner = initialProfile.banner;
    }

    await onSave(profile);
  };

  // Handle cancel — bail back to the user's profile
  const handleCancel = () => {
    router.push("/profile");
  };

  return (
    <div className="edit-profile">
      {/* Photo and banner */}
      <div className="dash-card">
        <h2 className="dash-card__title">Photo and banner</h2>
        <p className="dash-card__desc">
          Tap the banner or avatar to upload a new image. PNG, JPG, WebP, or GIF.
        </p>
        <div className="edit-profile__media">
          <BannerUpload
            currentBannerUrl={currentBannerUrl}
            onUpload={handleBannerUpload}
            isUploading={isUploadingBanner}
          />
          <div className="edit-profile__avatar-slot">
            <AvatarUpload
              currentAvatarUrl={currentAvatarUrl}
              fallbackInitials={fallbackInitials}
              onUpload={handleAvatarUpload}
              isUploading={isUploadingAvatar}
            />
          </div>
        </div>
      </div>

      {/* About you */}
      <div className="dash-card">
        <h2 className="dash-card__title">About you</h2>
        <p className="dash-card__desc">
          Your display name, bio, and website appear on your profile.
        </p>
        <div className="edit-profile__fields">
          <Input
            label="Display name"
            value={displayName}
            onChange={handleDisplayNameChange}
            maxLength={64}
            placeholder="Your display name"
            error={displayNameError}
            helperText={`${displayName.length}/64`}
          />

          <Textarea
            label="Bio"
            value={description}
            onChange={handleDescriptionChange}
            rows={4}
            maxLength={256}
            placeholder="Tell us about yourself"
            error={descriptionError}
            helperText={`${description.length}/256`}
          />

          <Input
            label="Website"
            type="url"
            value={website}
            onChange={handleWebsiteChange}
            maxLength={256}
            placeholder="https://example.com"
            error={websiteError}
            helperText="Optional. Include the https:// prefix."
          />
        </div>

        {saveError && (
          <div className="edit-profile__error">
            <ErrorMessage message={saveError} />
          </div>
        )}
      </div>

      <div className="edit-profile__actions">
        <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={isSaving}
          disabled={!hasChanges || !isValid || isSaving}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
};

export default ProfileEditForm;
