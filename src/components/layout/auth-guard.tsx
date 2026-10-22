"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Lock, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import LoadingSpinner from "@/components/ui/loading-spinner";
import type { EmptyStateIcon } from "@/components/ui/empty-state";
import SignedOutPrompt from "./signed-out-prompt";

export interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Signed-out headline. Defaults to a per-route title (see below). */
  signedOutTitle?: string;
  /** Signed-out one-line explanation. Defaults per route. */
  signedOutDescription?: string;
}

interface SignedOutCopy {
  icon: EmptyStateIcon;
  title: string;
  description: string;
}

// Per-route copy for the in-place sign-in prompt. Guarded segments mount
// AuthGuard from a server layout, so the copy is keyed off the pathname
// here rather than threaded through every layout.
function signedOutCopyFor(pathname: string | null): SignedOutCopy {
  if (pathname === "/settings" || pathname?.startsWith("/settings/")) {
    return {
      icon: Settings,
      title: "Sign in to manage your settings",
      description: "Your account, profile and privacy settings live here once you sign in to Certified.",
    };
  }
  return {
    icon: Lock,
    title: "Sign in to continue",
    description: "This page is only available once you sign in to Certified.",
  };
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  fallback,
  signedOutTitle,
  signedOutDescription,
}) => {
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useAuth();

  // Show loading spinner centered in the content area
  // The sidebar is already visible via AppShell
  if (isLoading) {
    return (
      <div className="auth-guard-loading" aria-busy="true">
        {fallback || <LoadingSpinner size="md" />}
      </div>
    );
  }

  // Signed out: explain what's here and offer sign-in in place, instead of
  // silently bouncing to "/" and losing the deep link. The sign-in flow
  // records the current path (lib/auth/post-signin) and returns here.
  if (!isAuthenticated) {
    const copy = signedOutCopyFor(pathname);
    return (
      <SignedOutPrompt
        icon={copy.icon}
        title={signedOutTitle ?? copy.title}
        description={signedOutDescription ?? copy.description}
      />
    );
  }

  // Render children when authenticated
  return <>{children}</>;
};

export default AuthGuard;
