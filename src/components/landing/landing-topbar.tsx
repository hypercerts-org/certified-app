"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";

/**
 * Landing light/dark switch, styled to match the sign-in button (off-white
 * pill, hairline border). Binary on purpose — the full Light/Dark/System
 * control lives in Settings. The icon reflects the CURRENT theme (Sun in
 * light, Moon in dark), matching the app's other theme controls. Renders a
 * stable Sun until mounted so SSR (default light) and the client agree.
 */
function LandingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Canonical next-themes SSR guard: defer reading the resolved theme until
    // after mount so the server (default light) and client first paint agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className="lp-topbar__theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      <span className="lp-topbar__theme-icon" aria-hidden="true">
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
      </span>
    </button>
  );
}

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
      {/* Theme switch + sign-in / open-app button — position: fixed, persists
          on scroll. The theme toggle doesn't depend on auth, so it renders
          immediately; the auth button waits for the session to resolve. */}
      <div className="lp-topbar__actions">
        <LandingThemeToggle />
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
