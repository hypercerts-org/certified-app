"use client";

import { useAuth } from "@/lib/auth/auth-context";

export default function HeroSignInButton() {
  const { openSignIn, openSignInModal } = useAuth();

  return (
    <div className="hero__actions">
      <button className="hero__btn-signin" onClick={openSignIn} aria-label="Sign in with Certified">
        <img src="/assets/certified_signinwith_black.svg" alt="Sign in with Certified" className="hero__btn-signin-img" />
      </button>
      <button
        type="button"
        className="signin-alt-link"
        onClick={() => openSignInModal("atproto")}
      >
        Use AT Protocol or Bluesky account
      </button>
    </div>
  );
}
