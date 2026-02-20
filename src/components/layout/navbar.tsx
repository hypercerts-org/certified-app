"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import Button from "@/components/ui/button";
import Avatar from "@/components/ui/avatar";

const Navbar: React.FC = () => {
  const { isLoading, session, did, signIn, signOut } = useAuth();

  // Truncate DID for display
  const truncatedDid = did ? `${did.slice(0, 24)}...` : "";
  
  // Extract display name from session if available
  const displayName = truncatedDid;

  return (
    <nav className="w-full bg-white border-b border-gray-200 h-16">
      <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
        {/* Left: Certified wordmark */}
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/assets/certified_wordmark_darkblue.svg"
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
            className="text-h4 text-navy font-semibold hidden items-center gap-2"
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
                <Avatar size="sm" fallbackInitials={did?.slice(4, 6) || "?"} />
                <span className="text-body-sm text-gray-700">
                  {displayName}
                </span>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            // Not authenticated state
            <Button variant="primary" size="sm" onClick={signIn}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
