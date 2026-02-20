"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import ErrorMessage from "@/components/ui/error-message";
import type { CertifiedProfile } from "@/lib/atproto/types";

export interface ProfileEditFormProps {
  initialProfile: CertifiedProfile | null;
  onSave: (profile: CertifiedProfile) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
}

const ProfileEditForm: React.FC<ProfileEditFormProps> = ({
  initialProfile,
  onSave,
  isSaving,
  saveError,
}) => {
  const router = useRouter();

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [website, setWebsite] = useState("");

  // Validation errors
  const [displayNameError, setDisplayNameError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [pronounsError, setPronounsError] = useState("");
  const [websiteError, setWebsiteError] = useState("");

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with profile data
  useEffect(() => {
    if (initialProfile) {
      setDisplayName(initialProfile.displayName || "");
      setDescription(initialProfile.description || "");
      setPronouns(initialProfile.pronouns || "");
      setWebsite(initialProfile.website || "");
    }
  }, [initialProfile]);

  // Track changes
  useEffect(() => {
    const changed =
      displayName !== (initialProfile?.displayName || "") ||
      description !== (initialProfile?.description || "") ||
      pronouns !== (initialProfile?.pronouns || "") ||
      website !== (initialProfile?.website || "");
    setHasChanges(changed);
  }, [displayName, description, pronouns, website, initialProfile]);

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

  // Validate pronouns
  const validatePronouns = (value: string) => {
    if (value.length > 20) {
      setPronounsError("Pronouns must be 20 characters or fewer");
      return false;
    }
    setPronounsError("");
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

  const handlePronounsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPronouns(value);
    validatePronouns(value);
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
    !pronounsError &&
    !websiteError;

  // Handle save
  const handleSave = async () => {
    // Re-validate all fields
    const displayNameValid = validateDisplayName(displayName);
    const descriptionValid = validateDescription(description);
    const pronounsValid = validatePronouns(pronouns);
    const websiteValid = validateWebsite(website);

    if (!displayNameValid || !descriptionValid || !pronounsValid || !websiteValid) {
      return;
    }

    // Construct profile
    const profile: CertifiedProfile = {
      // Preserve existing avatar and banner
      ...(initialProfile?.avatar && { avatar: initialProfile.avatar }),
      ...(initialProfile?.banner && { banner: initialProfile.banner }),
      // Set createdAt: use existing or new
      createdAt: initialProfile?.createdAt || new Date().toISOString(),
      // Add text fields (trim and omit empty strings)
      ...(displayName.trim() && { displayName: displayName.trim() }),
      ...(description.trim() && { description: description.trim() }),
      ...(pronouns.trim() && { pronouns: pronouns.trim() }),
      ...(website.trim() && { website: website.trim() }),
    };

    await onSave(profile);
  };

  // Handle cancel
  const handleCancel = () => {
    router.push("/profile");
  };

  return (
    <div>
      <h1 className="text-h1 text-navy mb-6">Edit Profile</h1>

      <Card className="shadow-elevation-1 rounded-card p-6">
        <div className="flex flex-col gap-6">
          {/* Display Name */}
          <Input
            label="Display name"
            value={displayName}
            onChange={handleDisplayNameChange}
            maxLength={640}
            placeholder="Your display name"
            error={displayNameError}
          />

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
            <div className="text-caption text-gray-400 text-right mt-1">
              {description.length}/256 characters
            </div>
          </div>

          {/* Pronouns */}
          <Input
            label="Pronouns"
            value={pronouns}
            onChange={handlePronounsChange}
            maxLength={200}
            placeholder="e.g., they/them"
            error={pronounsError}
          />

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
          <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
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
      </Card>
    </div>
  );
};

export default ProfileEditForm;
