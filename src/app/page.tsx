"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useSession } from "@/hooks/use-session";
import LoadingSpinner from "@/components/ui/loading-spinner";

/**
 * Home — `/`.
 *
 * The home of Certified is the signed-in user's own profile.
 * Unauthenticated visitors are redirected to /search (the people
 * explorer) AND the sign-in modal is auto-opened so they can complete
 * sign-in without an extra click.
 *
 * Implementation is a client-side redirect rather than an inline render
 * because the underlying profile page already lives at /profile/[handle]
 * and we want one canonical URL per profile rather than two.
 */
export default function Home() {
  const { isAuthenticated, isLoading, openSignIn } = useAuth();
  const { handle } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && handle) {
      router.replace(`/profile/${encodeURIComponent(handle)}`);
    } else if (!isAuthenticated) {
      router.replace("/search");
      // Open the sign-in modal after the navigation. Modal state lives in
      // the AuthProvider (root layout) so it persists across route change.
      openSignIn();
    }
  }, [isLoading, isAuthenticated, handle, router, openSignIn]);

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <LoadingSpinner />
      </div>
    </div>
  );
}
