"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import ProfileHeader from "./profile-header";
import type { CertifiedProfile } from "@/lib/atproto/types";

export interface ProfileViewProps {
  profile: CertifiedProfile | null;
  did: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  did,
  avatarUrl,
  bannerUrl,
}) => {
  // Format createdAt as "Month Year"
  const formatMemberSince = (dateString?: string): string | null => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const memberSince = formatMemberSince(profile?.createdAt);

  return (
    <div className="profile-view-container animate-slide-in">
      <ProfileHeader
        displayName={profile?.displayName}
        did={did}
        pronouns={profile?.pronouns}
        avatarUrl={avatarUrl}
        bannerUrl={bannerUrl}
      />

      {/* Profile details card */}
      <Card className="mt-6">
        {/* About section */}
        <div>
          <h3 className="text-caption text-gray-400 uppercase tracking-wider mb-2">
            ABOUT
          </h3>
          {profile?.description ? (
            <p className="text-body text-gray-700">{profile.description}</p>
          ) : (
            <p className="text-body text-gray-400 italic">
              No description yet.
            </p>
          )}
        </div>

        {/* Website section */}
        {profile?.website && (
          <div className="mt-4">
            <h3 className="text-caption text-gray-400 uppercase tracking-wider mb-2">
              WEBSITE
            </h3>
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body text-accent hover:underline inline-flex items-center gap-1"
            >
              {profile.website}
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Member since + Edit Profile on same row */}
        <div className="mt-4 flex items-end justify-between">
          {memberSince ? (
            <div>
              <h3 className="text-caption text-gray-400 uppercase tracking-wider mb-2">
                MEMBER SINCE
              </h3>
              <p className="text-body text-gray-700">{memberSince}</p>
            </div>
          ) : (
            <div />
          )}
          <Link href="/settings/edit-profile">
            <Button variant="secondary" size="sm">Edit Profile</Button>
          </Link>
        </div>
      </Card>

      <style jsx>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-slide-in {
          animation: slide-in 300ms ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-slide-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default ProfileView;
