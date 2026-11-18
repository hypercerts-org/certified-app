"use client";

import Link from "next/link";
import Button from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * The two hero CTAs. "Sign in with your email" opens the sign-in
 * modal directly (the label promises an email field, so the silent
 * default bounce would contradict it); "Create your account" runs the
 * silent-default flow — new users land on the PDS's account-creation
 * UI, returning users with a live PDS session sign straight in.
 *
 * `explore` adds a quieter third way in, a link to the network for
 * visitors who want to look around before they sign up (donors,
 * mostly); the hero passes it, the closing section doesn't. It has no
 * outward arrow: that glyph marks links that leave Certified, and this
 * one stays in the app.
 */
export default function HeroCta({ explore = false }: { explore?: boolean }) {
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
      {explore ? (
        <Link href="/explore" className="lp-link lp-hero__explore">
          Explore the network
        </Link>
      ) : null}
    </div>
  );
}
