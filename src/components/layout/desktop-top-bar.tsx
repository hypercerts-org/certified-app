"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasPageHeader, useNavbarValues } from "@/lib/navbar-context";
import { hasDesktopChrome } from "@/lib/layout/chrome";
import { useMounted } from "@/hooks/use-mounted";
import GlobalSearch from "@/components/search/global-search";
import { DesktopNewMenu } from "./new-menu";

/**
 * The desktop content strip (≥800px), above the page and beside the
 * sidebar (app-sidebar.tsx, which holds the brand, the account control and
 * the navigation):
 *
 *                                         [search          ] [+ New]
 *
 * Search (`/` and Cmd/Ctrl+K focus it) and, signed in, New. On /explore,
 * which has its own search, the field's slot stays empty, so New sits
 * where it does on every page. The strip scrolls with the page.
 *
 * Pages render a `<PageHeader>` (their visible h1); a page without one
 * keeps a visually hidden `<h1>` here, so every page has exactly one
 * (DESIGN.md §3.6). The sidebar is the page's banner, so the strip is a
 * plain block (the search field is its own search landmark).
 *
 * Hidden below 800px by CSS (the phone top bar and pill handle that
 * range) and absent on routes without the app chrome (chrome.ts).
 */
export default function DesktopTopBar() {
  const pathname = usePathname();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { pageTitle, desktopTitle, breadcrumb } = useNavbarValues();
  // The page can publish its title (and auth can resolve) before the strip
  // hydrates; until mounted, render exactly what the server did.
  const mounted = useMounted();
  const isLoading = authLoading || !mounted;
  const hasPageHeader = useHasPageHeader();

  if (!hasDesktopChrome(pathname)) return null;

  // Explore has its own search box at the top of the page; a second one
  // here would be two ways to do the same thing.
  const showSearch = !(pathname === "/explore" || pathname?.startsWith("/explore/"));

  // Fallback h1 for pages without a <PageHeader>: the record's name on
  // detail pages (desktopTitle), else the page title, else the breadcrumb.
  const breadcrumbText = breadcrumb
    ? [breadcrumb.left.text, breadcrumb.right?.text].filter(Boolean).join(" / ")
    : null;
  const fallbackTitle = desktopTitle ?? pageTitle ?? breadcrumbText;

  return (
    <div className="desktop-top-bar">
      {mounted && !hasPageHeader && fallbackTitle ? (
        <h1 className="sr-only">{fallbackTitle}</h1>
      ) : null}
      <div className="desktop-top-bar__row">
        {/* Also the tour's "search the network" spotlight. */}
        {showSearch ? (
          <div className="desktop-top-bar__search" data-tour="navbar-search">
            <GlobalSearch placeholder="Search" />
          </div>
        ) : (
          <div className="desktop-top-bar__search" aria-hidden="true" />
        )}
        {!isLoading && isAuthenticated ? <DesktopNewMenu /> : null}
      </div>
    </div>
  );
}
