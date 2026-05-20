"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useSession } from "@/hooks/use-session";
import LoadingSpinner from "@/components/ui/loading-spinner";

/**
 * Home — `/`.
 *
 * Signed-in visitors land on their own profile. Signed-out visitors
 * land on `/welcome` (the marketing landing); we no longer auto-open
 * the sign-in modal — the landing page has its own Sign-in CTAs.
 *
 * Implementation is a client-side redirect rather than an inline render
 * because the underlying profile page already lives at /profile/[handle]
 * and we want one canonical URL per profile rather than two.
 */
export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const { handle } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && handle) {
      router.replace(`/profile/${encodeURIComponent(handle)}`);
    } else if (!isAuthenticated) {
      router.replace("/welcome");
    }
  }, [isLoading, isAuthenticated, handle, router]);

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <LoadingSpinner />
      </div>
    </div>
  );
}
