import React from "react";
import Avatar from "@/components/ui/avatar";

export interface ProfileHeaderProps {
  displayName?: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  displayName,
  avatarUrl,
  bannerUrl,
}) => {
  const getInitials = () => {
    if (displayName) {
      const parts = displayName.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`;
      }
      return displayName.slice(0, 2);
    }
    return "?";
  };

  return (
    <div>
      {/* Banner */}
      <div className="profile-banner">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt="Profile banner"
          />
        ) : (
          <div className="profile-banner__fallback" />
        )}
      </div>

      {/* Avatar overlapping banner */}
      <div className="relative z-10 flex flex-col items-center -mt-12">
        <Avatar
          src={avatarUrl || undefined}
          alt={displayName || "Profile avatar"}
          size="xl"
          fallbackInitials={getInitials()}
          bordered={true}
          className="shadow-elevation-1"
        />

        <div className="mt-3 text-center">
          <h2 className="font-mono text-h2 text-navy uppercase tracking-tight">
            {displayName || (
              <span className="text-gray-400">Anonymous</span>
            )}
          </h2>
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;
