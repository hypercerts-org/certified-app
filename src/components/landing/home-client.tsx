"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useOrg } from "@/lib/groups/org-context";

/**
 * Root `/` redirector. Sends unauthenticated users to `/welcome` and
 * authenticated users to their canonical profile URL `/profile/{did}`.
 * The profile itself is rendered by ProfileClient at `/profile/[did]`.
 */
export default function HomeClient() {
  const router = useRouter();
  const { isLoading, isAuthenticated, did } = useAuth();
  const { activeOrg, isLoading: orgsLoading } = useOrg();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/welcome");
      return;
    }
    if (orgsLoading || !did) return;
    const targetDid = activeOrg?.groupDid || did;
    router.replace(`/profile/${encodeURIComponent(targetDid)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable
  }, [isLoading, isAuthenticated, orgsLoading, did, activeOrg?.groupDid]);

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <img
          src="/assets/certified_brandmark_black.svg"
          alt=""
          aria-hidden="true"
          className="loading-screen__logo"
        />
      </div>
    </div>
  );
}
