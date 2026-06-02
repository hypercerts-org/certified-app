"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import LoadingSpinner from "@/components/ui/loading-spinner";

/**
 * Root — `/`.
 *
 * Signed-in visitors land on `/home` (the activity feed). Signed-out
 * visitors land on `/welcome` (the marketing landing). Applies
 * uniformly across hosts — production (certified.app), redesign
 * (redesign.certified.app), and staging (staging.certified.app) all
 * resolve `/` through this component.
 *
 * Client-side redirect rather than a server-side rewrite because
 * authentication state lives in a cookie-backed client context and
 * resolves a tick after first paint; an inline loading spinner
 * covers that gap.
 */
export default function Root() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/home");
    } else {
      router.replace("/welcome");
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <LoadingSpinner />
      </div>
    </div>
  );
}
