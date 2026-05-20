"use client";

import { usePathname } from "next/navigation";
import { useNavbarContext } from "@/lib/navbar-context";
import SiteFooter from "@/components/layout/site-footer";

/**
 * Single-column shell (post-Overview-redesign).
 *
 * Structure:
 *   .app-shell                        min-height: 100vh; bg canvas
 *     .app-shell__grid                max-width 1320; margin 0 auto
 *       .app-shell__center            grid cell (center column)
 *         .app-shell__content         reading-width container
 *
 * The desktop top bar is mounted in the root layout (sibling to <main>),
 * NOT inside this grid. The left rail and right rail were both retired
 * in the Overview redesign — the top bar carries all chrome, and the
 * profile page widens its own container for the GitHub-style two-column
 * Overview layout.
 *
 * Fullbleed (profile pages) operates on .app-shell__content INSIDE the
 * center cell — banner extends to the cell width, not the viewport.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profileOverlay } = useNavbarContext();

  // /welcome bypasses the app shell entirely — the marketing
  // landing wants edge-to-edge hero / patterns / pricing strips,
  // not the 600/720px reading column the shell applies to every
  // other page. Mirrors the same short-circuit main's AppShell
  // does. Note: SiteFooter is not rendered on /welcome either —
  // the ReadyCta section is the page's own footer.
  if (pathname === "/welcome") {
    return <>{children}</>;
  }

  return (
    <div className={`app-shell ${profileOverlay ? "app-shell--fullbleed" : ""}`}>
      <div className="app-shell__grid">
        <div className="app-shell__center">
          <div className="app-shell__content">
            {children}
          </div>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
