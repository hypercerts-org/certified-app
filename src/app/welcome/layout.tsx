"use client";

import { useProfileNavbar } from "@/lib/navbar-context";
import { useAuth } from "@/lib/auth/auth-context";
import SiteFooter from "@/components/layout/site-footer";

/**
 * Welcome-page chrome — opts the page into the same transparent /
 * fullbleed treatment profile pages use, so the hero / bento /
 * pattern sections render edge-to-edge instead of being capped by
 * the global `.app-shell__content` reading column.
 *
 * Renders the global SiteFooter directly (the app-shell short-circuit
 * skips it on /welcome), full-bleed so the footer bar (border-top +
 * off-white band) spans the full viewport width like every other page.
 *
 * NOTE: this branch ships the local `useProfileNavbar` hook for
 * the transparent variant instead of main's `useNavbarVariant`;
 * the layout was adapted to match. Same intent on both sides.
 */
export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Logged-out viewers get the transparent overlay navbar so the
  // marketing hero reads edge-to-edge. Signed-in viewers instead get the
  // normal mobile top bar (hamburger → left sidebar, brandmark, account
  // switcher) so they can navigate out of the welcome page.
  const { isAuthenticated } = useAuth();
  useProfileNavbar(!isAuthenticated);
  return (
    <>
      {children}
      <div className="welcome-footer">
        <SiteFooter />
      </div>
    </>
  );
}
