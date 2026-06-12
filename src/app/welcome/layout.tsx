"use client";

import SiteFooter from "@/components/layout/site-footer";

/**
 * Welcome-page chrome — the page renders edge-to-edge (the app-shell
 * short-circuits its reading column on /welcome) under the regular
 * top navbar. Signed-out viewers get the same chrome as everywhere
 * else: hamburger + brandmark + sign-in on mobile, wordmark + search +
 * Explore/Apps/Help + sign-in on desktop. The hero already offsets
 * itself by --navbar-height, so the fixed mobile bar floats above it.
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
