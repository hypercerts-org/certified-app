"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import Avatar from "@/components/ui/avatar";
import Wordmark from "@/components/ui/wordmark";
import { getInitials } from "@/lib/utils/initials";

/** Scrolled this far, the wordmark (its bottom edge at 41px) is off the
 *  top of the screen: on phones the fixed button then gets its bar. */
const BAR_AFTER_PX = 40;

/**
 * Landing chrome: the faded Certified.app wordmark (as in the app's top
 * bars and footer) and the sign-in / open-app button. No theme switch:
 * like the rest of the app, the theme lives in Settings only.
 */
export default function LandingTopBar() {
  const { isLoading, isAuthenticated, openSignInModal, did } = useAuth();
  const { profile, avatarUrl } = useProfile();
  // Past the wordmark the fixed button would float over the page's text;
  // on phones (landing.css) it then sits in a translucent bar.
  const [pastWordmark, setPastWordmark] = useState(false);

  useEffect(() => {
    const update = () => setPastWordmark(window.scrollY > BAR_AFTER_PX);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      {/* Wordmark — in normal page flow, scrolls away */}
      <div className="lp-topbar">
        <Link href="/welcome" className="lp-topbar__home" aria-label="Certified — home">
          <Wordmark variant="certified-app" faded height={18} decorative />
        </Link>
      </div>
      {/* Sign-in / open-app button — position: fixed, persists on scroll.
          Waits for the session to resolve. */}
      <div className={`lp-topbar__actions${pastWordmark ? " lp-topbar__actions--bar" : ""}`}>
        {!isLoading &&
          (isAuthenticated ? (
            <Link href="/home" className="lp-topbar__btn lp-topbar__btn--account">
              <Avatar
                size="xs"
                src={avatarUrl || undefined}
                fallbackInitials={getInitials(profile?.displayName)}
                seed={did ?? undefined}
                className="lp-topbar__avatar"
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
          ))}
      </div>
    </>
  );
}
