"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Shield, LayoutGrid, LogOut, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { signOut } = useAuth();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const pathname = usePathname();

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (onClose) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = getInitials(profile?.displayName, null);

  return (
    <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`} aria-label="Main navigation">
      {/* Top: Logo + close button */}
      <div className="sidebar__logo">
        <Link href="/">
          <img src="/assets/certified_wordmark_white.svg" alt="Certified" />
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
              href="/"
              className={`sidebar__item ${pathname === "/" || pathname === "/settings/edit-profile" ? "sidebar__item--active" : ""}`}
            >
              <User size={18} />
              Profile
            </Link>
          </li>
          <li>
            <Link
              href="/settings/connected-apps"
              className={`sidebar__item ${pathname === "/settings/connected-apps" ? "sidebar__item--active" : ""}`}
            >
              <LayoutGrid size={18} />
              Apps
            </Link>
          </li>

          <li>
            <Link
              href="/settings/security"
              className={`sidebar__item ${pathname === "/settings/security" ? "sidebar__item--active" : ""}`}
            >
              <Shield size={18} />
              Security
            </Link>
          </li>
        </ul>
      </nav>

      {/* Bottom: User card */}
      <div className="sidebar__user">
        <Avatar size="sm" src={avatarUrl || undefined} fallbackInitials={initials} />
        <div className="sidebar__user-info">
          <p className="sidebar__user-name">{profile?.displayName || "Anonymous"}</p>
          <p className="sidebar__user-handle">@{handle || "..."}</p>
        </div>
        <button onClick={signOut} className="sidebar__signout" aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
