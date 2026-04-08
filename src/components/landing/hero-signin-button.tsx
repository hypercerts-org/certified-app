"use client";

import { useAuth } from "@/lib/auth/auth-context";

export default function HeroSignInButton() {
  const { openSignIn } = useAuth();

  return (
    <div className="hero__actions">
      <button className="hero__btn-signin" onClick={openSignIn} aria-label="Sign in with Certified">
        <img src="/assets/sign_in_with_certified_black.svg" alt="Sign in with Certified" className="hero__btn-signin-img" />
      </button>
    </div>
  );
}
