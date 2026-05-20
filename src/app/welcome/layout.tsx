"use client";

import { useProfileNavbar } from "@/lib/navbar-context";
import SiteFooter from "@/components/layout/site-footer";

/**
 * Welcome-page chrome — opts the page into the same transparent /
 * fullbleed treatment profile pages use, so the hero / bento /
 * pattern sections render edge-to-edge instead of being capped by
 * the global `.app-shell__content` reading column.
 *
 * Renders the global SiteFooter directly (the app-shell short-circuit
 * skips it on /welcome). Wrapped in `.landing-section__inner` so the
 * footer row aligns with the landing sections above it instead of
 * stretching to the viewport edges.
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
  useProfileNavbar();
  return (
    <>
      {children}
      <div className="welcome-footer">
        <div className="landing-section__inner">
          <SiteFooter />
        </div>
      </div>
    </>
  );
}
