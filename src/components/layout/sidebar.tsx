"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Shield, LayoutGrid, Lock, Wallet, LogOut, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { authFetch } from "@/lib/auth/fetch";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { signOut } = useAuth();
  const { profile, avatarUrl } = useProfile();
  const pathname = usePathname();
  const [handle, setHandle] = useState("");

  useEffect(() => {
    authFetch("/api/xrpc/com/atproto/server/getSession")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.handle) setHandle(data.handle);
      })
      .catch(() => {});
  }, []);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (onClose) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = getInitials(profile?.displayName, null);

  return (
    <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`}>
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
              className={`sidebar__item ${pathname === "/" ? "sidebar__item--active" : ""}`}
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
              Connected Apps
            </Link>
          </li>
          <li>
            <Link
              href="/settings/wallet"
              className={`sidebar__item ${pathname === "/settings/wallet" ? "sidebar__item--active" : ""}`}
            >
              <Wallet size={18} />
              Wallet
            </Link>
          </li>
          <li>
            <Link
              href="/settings/my-data"
              className={`sidebar__item ${pathname === "/settings/my-data" ? "sidebar__item--active" : ""}`}
            >
              <Lock size={18} />
              My Data
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
