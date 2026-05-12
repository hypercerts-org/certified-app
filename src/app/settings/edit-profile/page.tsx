"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { usePageTitle } from "@/lib/navbar-context";
import { putProfile, uploadAvatar, uploadBanner } from "@/lib/atproto/profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ProfileEditForm from "@/components/profile/profile-edit-form";
import type { CertifiedProfile } from "@/lib/atproto/types";

export default function EditProfilePage() {
  usePageTitle("Edit profile");
  const router = useRouter();
  const { isAuthenticated, did } = useAuth();
  const { profile, isLoading, refetch, avatarUrl, bannerUrl } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAvatarUpload = (file: File) => uploadAvatar(file);
  const handleBannerUpload = (file: File) => uploadBanner(file);

  const handleSave = async (updatedProfile: CertifiedProfile) => {
    if (!isAuthenticated || !did) {
      setSaveError("Not authenticated");
      return;
    }
    try {
      setIsSaving(true);
      setSaveError(null);
      await putProfile(did, updatedProfile);
      await refetch();
      router.push("/profile");
    } catch (error) {
      console.error("Failed to save profile:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const currentAvatarUrl = avatarUrl;
  const currentBannerUrl = bannerUrl;

  const fallbackInitials = profile?.displayName
    ? profile.displayName.slice(0, 2)
    : did ? did.slice(4, 6) : "?";

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {isLoading ? (
            <div className="edit-profile__loading">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <ProfileEditForm
              initialProfile={profile}
              onSave={handleSave}
              isSaving={isSaving}
              saveError={saveError}
              onAvatarUpload={handleAvatarUpload}
              onBannerUpload={handleBannerUpload}
              currentAvatarUrl={currentAvatarUrl}
              currentBannerUrl={currentBannerUrl}
              fallbackInitials={fallbackInitials}
            />
          )}
        </div>
      </div>
    </div>
  );
}
