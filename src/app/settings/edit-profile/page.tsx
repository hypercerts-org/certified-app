"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { usePageTitle } from "@/lib/navbar-context";
import { putProfile, uploadAvatar, uploadBanner } from "@/lib/atproto/profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ProfileEditForm from "@/components/profile/profile-edit-form";
import type { CertifiedProfile } from "@/lib/atproto/types";

export default function EditProfilePage() {
  usePageTitle("Edit profile");
  const { isAuthenticated, did } = useAuth();
  const { profile, isLoading, avatarUrl, bannerUrl } = useProfile();
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
      // Defensive: evict any browser-cached resolve-did response for
      // this DID so the next page load sees the fresh record even if
      // a stale response is sitting in the disk cache from before we
      // switched same-DID responses to no-store. `cache: "reload"`
      // forces the browser to refetch and store the new response.
      await fetch(`/api/resolve-did?did=${encodeURIComponent(did)}`, {
        cache: "reload",
        credentials: "include",
      }).catch(() => undefined);
      // Hard reload to /profile so every component (profile context,
      // navbar avatar, useUserProfile on the destination page, blob
      // URLs) remounts with fresh data. A client-side push here used
      // to leave the navbar showing the old avatar for ~30s.
      window.location.assign("/profile");
      // Don't reset isSaving — the page is unmounting on navigate.
      return;
    } catch (error) {
      console.error("Failed to save profile:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to save profile");
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
