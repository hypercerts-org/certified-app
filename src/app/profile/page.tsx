"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ErrorMessage from "@/components/ui/error-message";
import ProfileView from "@/components/profile/profile-view";

export default function ProfilePage() {
  const router = useRouter();
  const { agent, did } = useAuth();
  const { profile, isLoading, error, refetch, avatarUrl, bannerUrl } =
    useProfile();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!agent && !isLoading) {
      router.push("/");
    }
  }, [agent, isLoading, router]);

  // Show loading spinner while fetching
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Show error message with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ErrorMessage message={error} onRetry={refetch} />
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!did) {
    return null;
  }

  // Render profile view
  return (
    <ProfileView
      profile={profile}
      did={did}
      avatarUrl={avatarUrl}
      bannerUrl={bannerUrl}
    />
  );
}
