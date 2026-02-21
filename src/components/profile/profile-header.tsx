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
  // Get initials for avatar fallback
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
      <div className="w-full h-48 rounded-card overflow-hidden">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt="Profile banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-navy to-deep" />
        )}
      </div>

      {/* Avatar overlapping banner */}
      <div className="flex flex-col items-center -mt-12">
        <Avatar
          src={avatarUrl || undefined}
          alt={displayName || "Profile avatar"}
          size="xl"
          fallbackInitials={getInitials()}
          bordered={true}
          className="shadow-elevation-1"
        />

        {/* Display name */}
        <div className="mt-3 text-center">
          <h2 className="text-h2 text-navy">
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
