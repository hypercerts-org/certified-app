"use client";

import { useAuth } from "@/lib/auth/auth-context";

type Variant = "hero" | "cta";

const WRAPPER_CLASS: Record<Variant, string> = {
  hero: "hero__actions",
  cta: "landing-cta__actions",
};

export default function SignInWithCertifiedButton({ variant }: { variant: Variant }) {
  const { openSignIn, openSignInModal } = useAuth();

  return (
    <div className={WRAPPER_CLASS[variant]}>
      <button
        className="hero__btn-signin"
        onClick={openSignIn}
        aria-label="Sign in with Certified"
      >
        <img
          src="/assets/certified_signinwith_black.svg"
          alt="Sign in with Certified"
          className="hero__btn-signin-img"
        />
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
