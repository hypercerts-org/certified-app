"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

export default function LandingTopBar() {
  const { isLoading, isAuthenticated, openSignInModal, did } = useAuth();
  const { profile, avatarUrl } = useProfile();

  return (
    <>
      {/* Centered wordmark — in normal page flow, scrolls away */}
      <div className="lp-topbar">
        <Link href="/welcome" className="lp-topbar__home" aria-label="Certified — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/wordmark/certified_wordmark_black.svg"
            alt="Certified"
            className="lp-topbar__wordmark"
          />
        </Link>
      </div>
      {/* Sign-in / open-app button — position: fixed, persists on scroll */}
      {!isLoading && (
        isAuthenticated ? (
          <Link href="/home" className="lp-topbar__btn lp-topbar__btn--account">
            <Avatar
              size="sm"
              src={avatarUrl || undefined}
              fallbackInitials={getInitials(profile?.displayName, did)}
              className="lp-topbar__avatar !h-5 !w-5"
            />
            Open app
          </Link>
        ) : (
          <button
            type="button"
            className="lp-topbar__btn"
            onClick={() => openSignInModal()}
          >
            Sign in
          </button>
        )
      )}
    </>
  );
}
