"use client";

import Button from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * The two hero CTAs. "Sign in with your email" opens the sign-in
 * modal directly (the label promises an email field, so the silent
 * default bounce would contradict it); "Create your account" runs the
 * silent-default flow — new users land on the PDS's account-creation
 * UI, returning users with a live PDS session sign straight in.
 */
export default function HeroCta() {
  const { openSignInModal, openSignIn } = useAuth();

  return (
    <div className="lp-hero__actions">
      <Button size="lg" className="lp-cta-btn" onClick={() => openSignInModal()}>
        Sign in with your email
      </Button>
      <Button
        size="lg"
        variant="secondary"
        className="lp-cta-btn"
        onClick={() => void openSignIn()}
      >
        Create your account
      </Button>
    </div>
  );
}
