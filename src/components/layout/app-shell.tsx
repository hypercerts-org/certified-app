"use client";

import { usePathname } from "next/navigation";
import { useNavbarContext } from "@/lib/navbar-context";
import SiteFooter from "@/components/layout/site-footer";
import { routeChrome } from "@/lib/layout/chrome";


/**
 * The page frame: `<main>` and, after it, the site footer.
 *
 * Structure:
 *   main#main-content                 the skip link's target
 *     .app-shell                      min-height: fills main; bg canvas
 *       .app-shell__grid              max-width 1300; margin 0 auto
 *         .app-shell__center          grid cell (center column)
 *           .app-shell__content       reading-width container
 *   SiteFooter                        outside <main>, so it is the page's
 *                                     contentinfo landmark; full viewport
 *                                     width, like the top bar.
 *
 * `<main>` is at least one screen tall (`.app-main`, layout.css), so the
 * footer never shows in the first screen while a page is still loading
 * and then jumps away when its content arrives.
 *
 * The top bars are mounted in the root layout (siblings before this).
 * Pages in a `<PageContainer>` lift the reading-column cap and set their
 * own width (layout.css, "Page-frame layout").
 *
 * /welcome, the legal pages and /embed skip the app column: the landing
 * and legal pages render edge to edge (the landing's footer sits on its
 * off-white band), and embeds render bare, with no footer.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profileOverlay } = useNavbarContext();

  const main = (content: React.ReactNode, fill = true) => (
    <main id="main-content" className={`flex-1 flex flex-col${fill ? " app-main" : ""}`}>
      {content}
    </main>
  );

  const chrome = routeChrome(pathname);
  // Embeds have no footer to hold back, and fill their iframe as they are.
  if (chrome === "embed") return main(children, false);

  if (chrome === "landing") {
    return (
      <>
        {main(children)}
        <div className="welcome-footer">
          <SiteFooter />
        </div>
      </>
    );
  }

  // Editorial pages: full-width content with no app column, still with
  // the site footer, whose edges follow the landing top bar's (landing.css).
  if (chrome === "editorial") {
    return (
      <>
        {main(children)}
        <div className="editorial-footer">
          <SiteFooter />
        </div>
      </>
    );
  }

  return (
    <>
      {main(
        <div className={`app-shell ${profileOverlay ? "app-shell--fullbleed" : ""}`}>
          <div className="app-shell__grid">
            <div className="app-shell__center">
              <div className="app-shell__content">{children}</div>
            </div>
          </div>
        </div>,
      )}
      <SiteFooter />
    </>
  );
}
