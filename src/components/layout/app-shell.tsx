"use client";

import { useNavbarContext } from "@/lib/navbar-context";
import DesktopLeftRail from "./desktop-left-rail";
import DesktopRightRail from "./desktop-right-rail";

/**
 * Three-column shell.
 *
 * Structure:
 *   .app-shell                         min-height: 100vh; bg canvas
 *     .app-shell__grid                 max-width 1300; margin 0 auto; CSS grid >=800px
 *       .left-rail                     CSS display:none <800px
 *       .app-shell__center             grid cell (center column)
 *         .app-shell__content          reading-width container (600px on desktop)
 *       .right-rail                    CSS display:none <1100px
 *
 * Rails are rendered unconditionally (CSS-mountable) so first paint at
 * desktop widths is correct without JS. The use-layout-breakpoints hook
 * is used only by the three focusable components (BottomNav, MobileSidebar,
 * hamburger button) that must JS-unmount at >=800px for a11y.
 *
 * Fullbleed (profile pages) operates on .app-shell__content INSIDE the center
 * cell — banner extends to the cell width, not the viewport.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profileOverlay } = useNavbarContext();
  return (
    <div className={`app-shell ${profileOverlay ? "app-shell--fullbleed" : ""}`}>
      <div className="app-shell__grid">
        <DesktopLeftRail />
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
