"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { putProfile, uploadAvatar, uploadBanner, getAvatarUrl, getBannerUrl } from "@/lib/atproto/profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ProfileEditForm from "@/components/profile/profile-edit-form";
import AuthGuard from "@/components/layout/auth-guard";
import type { CertifiedProfile } from "@/lib/atproto/types";

export default function EditProfilePage() {
  const router = useRouter();
  const { isAuthenticated, did, pdsUrl } = useAuth();
  const { profile, isLoading, refetch } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const effectivePdsUrl = pdsUrl || process.env.NEXT_PUBLIC_PDS_URL || "https://epds1.test.certified.app";

  const handleAvatarUpload = async (file: File): Promise<Record<string, unknown>> => {
    return await uploadAvatar(file);
  };

  const handleBannerUpload = async (file: File): Promise<Record<string, unknown>> => {
    return await uploadBanner(file);
  };

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
      router.push("/");
    } catch (error) {
      console.error("Failed to save profile:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const currentAvatarUrl = profile && did ? getAvatarUrl(profile, did, effectivePdsUrl) : null;
  const currentBannerUrl = profile && did ? getBannerUrl(profile, did, effectivePdsUrl) : null;

  const fallbackInitials = profile?.displayName
    ? profile.displayName.slice(0, 2)
    : did ? did.slice(4, 6) : "?";

  return (
    <AuthGuard>
      <div className="dashboard">
        {/* Top bar */}
        <div className="dashboard__topbar">
          <h1 className="dashboard__page-title">Edit Profile</h1>
          <div className="dashboard__topbar-right">
            <button
              className="dashboard__back-btn"
              onClick={() => router.push("/")}
            >
              <ArrowLeft size={16} />
              Back to Profile
            </button>
          </div>
        </div>

        {/* Main content — single column, no right sidebar */}
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
    </AuthGuard>
  );
}
