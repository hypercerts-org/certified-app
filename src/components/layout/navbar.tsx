"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const { variant } = useNavbarVariant();
  const { profile, avatarUrl } = useProfile();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const avatarInitials = getInitials(profile?.displayName, did);

  // Don't render navbar while auth is loading — prevents white flash
  if (isLoading) return null;

  // Hide navbar for authenticated users (sidebar replaces it)
  if (isAuthenticated) return null;

  const isTransparent = variant === "transparent";

  const navClasses = [
    "navbar",
    isTransparent ? "navbar--transparent" : "navbar--default",
    scrolled ? "navbar--scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={navClasses}>
      <div className="navbar__inner">
        <Link href="/" className="navbar__logo">
          <img src="/assets/certified_wordmark_black_green.png" alt="Certified" className="navbar__logo-img" />
        </Link>

        <div className="navbar__right">
          {isLoading ? (
            <div className="w-20" />
          ) : isAuthenticated ? (
            <>
              <Link
                href="/"
                className="flex items-center hover:opacity-80 transition-opacity duration-150"
              >
                <Avatar size="sm" src={avatarUrl || undefined} fallbackInitials={avatarInitials} />
              </Link>
              <button
                onClick={signOut}
                className="navbar__signout"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={openSignIn}
              className="navbar__signin"
            >
              <img src="/assets/sign_in_black_small.svg" alt="Sign in" className="navbar__signin-img" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
