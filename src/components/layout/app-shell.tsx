"use client";

import { useNavbarContext } from "@/lib/navbar-context";
import DesktopRightRail from "./desktop-right-rail";

/**
 * Two-zone shell (post-redesign).
 *
 * Structure:
 *   .app-shell                         min-height: 100vh; bg canvas
 *     .app-shell__grid                 max-width 1300; margin 0 auto; CSS grid >=800px
 *       .app-shell__center             grid cell (center column)
 *         .app-shell__content          reading-width container (600px on desktop)
 *       .right-rail                    CSS display:none <1100px
 *
 * The desktop top bar is mounted in the root layout (sibling to <main>),
 * NOT inside this grid — it spans the full viewport width and sits above
 * the grid as a sticky chrome bar. The left rail was removed in the
 * positioning redesign; nav lives in the top bar.
 *
 * Fullbleed (profile pages on mobile) operates on .app-shell__content INSIDE
 * the center cell — banner extends to the cell width, not the viewport.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profileOverlay } = useNavbarContext();
  return (
    <div className={`app-shell ${profileOverlay ? "app-shell--fullbleed" : ""}`}>
      <div className="app-shell__grid">
        <div className="app-shell__center">
          <div className="app-shell__content">
            {children}
          </div>
        </div>
        <DesktopRightRail />
      </div>
    </div>
  );
}
