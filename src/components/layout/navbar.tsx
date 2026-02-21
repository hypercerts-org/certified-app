"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import Button from "@/components/ui/button";
import Avatar from "@/components/ui/avatar";

const Navbar: React.FC = () => {
  const { isLoading, session, did, signIn, signOut } = useAuth();
  const { variant } = useNavbarVariant();
  const { profile, avatarUrl } = useProfile();
  const [scrolled, setScrolled] = useState(false);

  // Scroll listener for transparent navbar
  useEffect(() => {
    if (variant !== "transparent") return;

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [variant]);

  // Compute display name and initials from profile
  const displayName = profile?.displayName || null;
  const avatarInitials = displayName
    ? displayName.trim().split(/\s+/).length >= 2
      ? `${displayName.trim().split(/\s+/)[0][0]}${displayName.trim().split(/\s+/)[1][0]}`
      : displayName.slice(0, 2)
    : did?.slice(4, 6) || "?";

  // Determine navbar styles based on variant
  const isTransparent = variant === "transparent";
  const navClasses = isTransparent
    ? `fixed top-0 left-0 w-full z-50 h-16 navbar-transparent ${
        scrolled ? "bg-navy" : "bg-transparent"
      }`
    : "w-full bg-white border-b border-gray-200 h-16";

  const wordmarkSrc = isTransparent
    ? "/assets/certified_wordmark_white.svg"
    : "/assets/certified_wordmark_darkblue.svg";

  const textColor = isTransparent ? "text-white" : "text-navy";
  const buttonVariant = isTransparent ? "ghost" : "primary";

  return (
    <nav className={navClasses}>
      <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
        {/* Left: Certified wordmark */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src={wordmarkSrc}
            alt="Certified"
            className="h-8"
            onError={(e) => {
              // Fallback to text + icon if SVG doesn't exist
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) {
                (fallback as HTMLElement).style.display = "flex";
              }
            }}
          />
          <span
            className={`text-h4 ${textColor} font-semibold hidden items-center gap-2`}
            style={{ display: "none" }}
          >
            <CheckCircle className="h-6 w-6 text-accent" />
            Certified
          </span>
        </Link>

        {/* Right: Auth state */}
        <div className="flex items-center gap-4">
          {isLoading ? (
            // Show nothing during loading to avoid layout shift
            <div className="w-24" />
          ) : session ? (
            // Authenticated state
            <>
              <Link
                href="/profile"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200"
              >
                <Avatar size="sm" src={avatarUrl || undefined} fallbackInitials={avatarInitials} />
                {displayName && (
                  <span className={`text-body-sm ${isTransparent ? "text-white" : "text-gray-700"}`}>
                    {displayName}
                  </span>
                )}
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            // Not authenticated state
            <>
              {isTransparent ? (
                <button
                  onClick={signIn}
                  className="px-4 py-2 text-sm font-medium text-white border border-white/60 rounded-md bg-white/10 hover:bg-white/20 hover:border-white transition-colors duration-200"
                >
                  Sign in
                </button>
              ) : (
                <Button variant="primary" size="sm" onClick={signIn}>
                  Sign in
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
