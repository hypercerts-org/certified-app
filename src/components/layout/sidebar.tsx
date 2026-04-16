"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Settings, LayoutGrid, Building2, LogOut, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useOrgProfile } from "@/hooks/use-org-profile";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { signOut, did } = useAuth();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const { activeOrg } = useOrg();
  const { orgAvatarUrl } = useOrgProfile();
  const pathname = usePathname();
  const profileDid = activeOrg?.groupDid || did;
  const profileHref = profileDid ? `/profile/${encodeURIComponent(profileDid)}` : "/";
  const isProfileActive =
    pathname === "/" ||
    pathname.startsWith("/profile/") ||
    pathname === "/settings/edit-profile";

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (onClose) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOrgMode = !!activeOrg;
  const displayName = isOrgMode
    ? (activeOrg.displayName || activeOrg.handle)
    : (profile?.displayName || "Anonymous");
  const displayHandle = isOrgMode ? activeOrg.handle : (handle || "...");
  const displayAvatar = isOrgMode ? (orgAvatarUrl || undefined) : (avatarUrl || undefined);
  const displayInitials = isOrgMode
    ? (activeOrg.displayName || activeOrg.handle || "O").slice(0, 2).toUpperCase()
    : getInitials(profile?.displayName, null);

  return (
    <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`} aria-label="Main navigation">
      {/* Top: Logo + close button */}
      <div className="sidebar__logo">
        <Link href="/">
          <img src="/assets/certified_wordmark_white_green.svg" alt="Certified" />
        </Link>
        {onClose && (
          <button className="sidebar__close" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav">
        <p className="sidebar__section-label">Account</p>
        <ul className="sidebar__menu">
          <li>
            <Link
              href={profileHref}
              className={`sidebar__item ${isProfileActive ? "sidebar__item--active" : ""}`}
            >
              <User size={18} />
              Profile
            </Link>
          </li>

          {!isOrgMode && (
            <li>
              <Link
                href="/groups"
                className={`sidebar__item ${pathname.startsWith("/groups") ? "sidebar__item--active" : ""}`}
              >
                <Building2 size={18} />
                Groups
              </Link>
            </li>
          )}

          <li>
            <Link
              href="/connected-apps"
              className={`sidebar__item ${pathname === "/connected-apps" ? "sidebar__item--active" : ""}`}
            >
              <LayoutGrid size={18} />
              Apps
            </Link>
          </li>

          <li>
            <Link
              href="/settings"
              className={`sidebar__item ${pathname === "/settings" ? "sidebar__item--active" : ""}`}
            >
              <Settings size={18} />
              Settings
            </Link>
          </li>
        </ul>
      </nav>

      {/* Bottom: User card */}
      <div className="sidebar__user">
        <Avatar size="sm" src={displayAvatar} fallbackInitials={displayInitials} />
        <div className="sidebar__user-info">
          <p className="sidebar__user-name">{displayName}</p>
          <p className="sidebar__user-handle">@{displayHandle}</p>
        </div>
        <button onClick={signOut} className="sidebar__signout" aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
