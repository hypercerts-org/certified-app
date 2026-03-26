"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Profile" },
  { href: "/connected-apps", label: "Apps" },
  { href: "/settings", label: "Settings" },
];

const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const { variant } = useNavbarVariant();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown on navigation
  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  const avatarInitials = getInitials(profile?.displayName, did);

  // Don't render navbar while auth is loading — prevents white flash
  if (isLoading) return null;

  const isTransparent = !isAuthenticated && variant === "transparent";

  const navClasses = [
    "navbar",
    isAuthenticated ? "navbar--default" : (isTransparent ? "navbar--transparent" : "navbar--default"),
    scrolled ? "navbar--scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === "/settings/edit-profile";
    return pathname.startsWith(href);
  };

  return (
    <nav className={navClasses}>
      <div className="navbar__inner">
        <Link href="/" className="navbar__logo">
          <img src="/assets/certified_wordmark_black_green.png" alt="Certified" className="navbar__logo-img" />
        </Link>

        {isAuthenticated ? (
          <>
            {/* Desktop: nav links */}
            <div className="navbar__app-links">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`navbar__app-link ${isActive(link.href) ? "navbar__app-link--active" : ""}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Desktop: user + sign out */}
            <div className="navbar__user">
              <Link href="/">
                <Avatar size="sm" src={avatarUrl || undefined} fallbackInitials={avatarInitials} />
              </Link>
              <button onClick={signOut} className="navbar__signout">
                Sign out
              </button>
            </div>

            {/* Mobile: hamburger */}
            <button
              className="navbar__hamburger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label={dropdownOpen ? "Close menu" : "Open menu"}
            >
              {dropdownOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            {/* Mobile: dropdown */}
            <div className={`navbar__dropdown ${dropdownOpen ? "navbar__dropdown--open" : ""}`}>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`navbar__dropdown-link ${isActive(link.href) ? "navbar__dropdown-link--active" : ""}`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="navbar__dropdown-user">
                <div className="navbar__dropdown-user-info">
                  <Avatar size="sm" src={avatarUrl || undefined} fallbackInitials={avatarInitials} />
                  <span className="navbar__dropdown-user-name">{profile?.displayName || `@${handle}`}</span>
                </div>
                <button onClick={signOut} className="navbar__signout">
                  Sign out
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="navbar__right">
            <button
              onClick={openSignIn}
              className="navbar__signin"
            >
              <img src="/assets/sign_in_black_small.svg" alt="Sign in" className="navbar__signin-img" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
