"use client";

import React from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ErrorMessage from "@/components/ui/error-message";
import ProfileView from "@/components/profile/profile-view";
import AuthGuard from "@/components/layout/auth-guard";

export default function ProfilePage() {
  const { did } = useAuth();
  const { profile, isLoading, error, refetch, avatarUrl, bannerUrl } =
    useProfile();

  return (
    <AuthGuard>
      {/* Show loading spinner while fetching */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner size="md" />
        </div>
      )}

      {/* Show error message with retry button */}
      {error && (
        <div className="flex items-center justify-center min-h-[400px]">
          <ErrorMessage message={error} onRetry={refetch} />
        </div>
      )}

      {/* Render profile view */}
      {!isLoading && !error && did && (
        <ProfileView
          profile={profile}
          did={did}
          avatarUrl={avatarUrl}
          bannerUrl={bannerUrl}
        />
      )}
    </AuthGuard>
  );
}
