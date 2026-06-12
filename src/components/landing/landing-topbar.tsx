"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";

export default function LandingTopBar() {
  const { isLoading, isAuthenticated, openSignInModal } = useAuth();

  return (
    <>
      {/* Centered wordmark — in normal page flow, scrolls away */}
      <div className="lp-topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/wordmark/certified_wordmark_black.svg"
          alt="Certified"
          className="lp-topbar__wordmark"
        />
      </div>
      {/* Sign-in / open-app button — position: fixed, persists on scroll */}
      {!isLoading && (
        isAuthenticated ? (
          <Link href="/home" className="lp-topbar__btn">
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
