"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { putProfile } from "@/lib/atproto/profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ProfileEditForm from "@/components/profile/profile-edit-form";
import type { CertifiedProfile } from "@/lib/atproto/types";

export default function EditProfilePage() {
  const router = useRouter();
  const { agent, did } = useAuth();
  const { profile, isLoading, refetch } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isLoading && !agent) {
      router.push("/");
    }
  }, [agent, isLoading, router]);

  // Handle save
  const handleSave = async (updatedProfile: CertifiedProfile) => {
    if (!agent || !did) {
      setSaveError("Not authenticated");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);
      await putProfile(agent, did, updatedProfile);
      await refetch();
      router.push("/profile");
    } catch (error) {
      console.error("Failed to save profile:", error);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save profile"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Show loading spinner while checking auth or loading profile
  if (isLoading || !agent) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <ProfileEditForm
      initialProfile={profile}
      onSave={handleSave}
      isSaving={isSaving}
      saveError={saveError}
    />
  );
}
