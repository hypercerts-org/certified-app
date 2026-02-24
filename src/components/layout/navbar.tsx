"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import Avatar from "@/components/ui/avatar";

const Navbar: React.FC = () => {
  const { isLoading, session, did, openSignIn, signOut } = useAuth();
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

  const avatarInitials = (() => {
    const name = profile?.displayName || null;
    if (!name) return did?.slice(4, 6) || "?";
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  })();

  const isTransparent = variant === "transparent";

  const navClasses = [
    "navbar",
    isTransparent ? "navbar--transparent" : "navbar--default",
    scrolled ? "navbar--scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const wordmarkSrc = isTransparent
    ? "/assets/certified_wordmark_white.svg"
    : "/assets/certified_wordmark_darkblue.svg";

  return (
    <nav className={navClasses}>
      <div className="navbar__inner">
        <Link href="/" className="navbar__logo">
          <img
            src={wordmarkSrc}
            alt="Certified"
          />
        </Link>

        <div className="navbar__right">
          {isLoading ? (
            <div className="w-20" />
          ) : session ? (
            <>
              <Link
                href="/"
                className="flex items-center hover:opacity-80 transition-opacity duration-150"
              >
                <Avatar size="sm" src={avatarUrl || undefined} fallbackInitials={avatarInitials} />
              </Link>
              <button
                onClick={signOut}
                className={`font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded transition-colors duration-150 ${
                  isTransparent
                    ? "text-white/60 hover:text-white/90"
                    : "text-gray-400 hover:text-navy"
                }`}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={openSignIn}
              className={`font-mono text-xs uppercase tracking-wider px-4 py-2 rounded transition-all duration-150 ${
                isTransparent
                  ? "text-white/70 border border-white/20 hover:border-white/40 hover:text-white"
                  : "text-navy border border-navy/20 hover:border-navy/40 bg-transparent"
              }`}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
