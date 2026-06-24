"use client";

import SiteFooter from "@/components/layout/site-footer";

/**
 * Welcome-page chrome — the page renders edge-to-edge (the app-shell
 * short-circuits its reading column on /welcome). The only chrome is the
 * minimal LandingTopBar (wordmark + sign-in / open-app button), rendered
 * by LandingPage itself. The full app navbar, bottom-nav and
 * desktop-top-bar all return null on /welcome, so this pared-back chrome
 * is identical at every width (mobile and desktop).
 *
 * Renders the global SiteFooter directly (the app-shell short-circuit
 * skips it on /welcome), full-bleed so the footer bar (border-top +
 * off-white band) spans the full viewport width like every other page.
 */
export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <div className="welcome-footer">
        <SiteFooter />
      </div>
    </>
  );
}
