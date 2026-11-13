"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasPageHeader, useNavbarValues } from "@/lib/navbar-context";
import { useViewTransition } from "@/lib/view-transitions";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useScrollHideNavbar } from "@/hooks/use-scroll-hide-navbar";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { isTopLevelPath } from "@/lib/layout/destinations";
import { parseActor } from "@/lib/urls";
import Button from "@/components/ui/button";
import Brandmark from "@/components/ui/brandmark";
import AddToListMenu from "@/components/lists/add-to-list-menu";
import type { TypedListType } from "@/lib/atproto/typed-lists";
import { PhoneAccountMenu } from "./account-menu";
import { PhoneNewMenu } from "./new-menu";

/**
 * True when `pathname` is the profile of the account the viewer acts as
 * (their own, or the active group's). Matches a handle case-insensitively,
 * or the DID while the handle is still loading.
 */
function isOwnProfilePath(
  pathname: string | null,
  own: { handle?: string | null; did?: string | null }[],
): boolean {
  const segments = (pathname ?? "").split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const parsed = parseActor(segments[0]);
  if (parsed.kind === "invalid") return false;
  const actor = parsed.value.toLowerCase();
  return own.some(
    ({ handle, did }) =>
      (!!handle && handle.toLowerCase() === actor) || (!!did && did === parsed.value),
  );
}

/**
 * Phone top bar (below 800px). Two layouts:
 *
 * - **The normal bar**: the brandmark on the left; on the right a `+` (the
 *   New menu, as a sheet) and the avatar (the account sheet), or "Sign in"
 *   when signed out. Used on the top-level pages (Home, Feed, Explore,
 *   Records, Apps, Settings, Help, your own profile), on any page without
 *   a title, and on every page that renders a `<PageHeader>` — the page
 *   header already carries the title and its own back link, so the bar
 *   doesn't repeat them.
 * - **Fallback detail bar** (a titled page with no PageHeader): a back
 *   chevron and the compact title, which is then the page's h1.
 *
 * It's a `<header>` (the banner landmark), not a `<nav>`: it holds the
 * brand and two buttons, not a list of links.
 *
 * Fixed, translucent, hides on scroll down and returns on scroll up — except
 * while acting as a group, when it stays put with the acting-as bar below.
 */
const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn } = useAuth();
  const { pageTitle, breadcrumb, recordMenu } = useNavbarValues();
  const hasPageHeader = useHasPageHeader();
  const { handle } = useSession();
  const { activeOrg } = useOrg();
  const pathname = usePathname();
  const { transitionBack } = useViewTransition();
  const { scrolled, navHidden } = useScrollHideNavbar();
  const { isDesktop } = useLayoutBreakpoints();

  // Don't render while auth is loading (prevents a signed-out flash), on
  // desktop (the desktop top bar owns that range), in embeds (bare board in
  // a third-party iframe) or on /welcome (the landing has its own minimal
  // chrome at every width). All early returns sit after every hook.
  if (isLoading) return null;
  if (isDesktop) return null;
  if (pathname?.startsWith("/embed")) return null;
  if (pathname === "/welcome") return null;

  const isOwnProfile =
    isAuthenticated &&
    isOwnProfilePath(pathname, [
      { handle, did },
      ...(activeOrg ? [{ handle: activeOrg.handle, did: activeOrg.groupDid }] : []),
    ]);
  const hasTitle = !!(pageTitle || breadcrumb);
  const isTopLevel =
    isTopLevelPath(pathname) || isOwnProfile || !hasTitle || hasPageHeader;

  const navClasses = [
    "navbar",
    scrolled ? "navbar--scrolled" : "",
    // Acting as a group keeps the bar (and the acting-as bar under it)
    // pinned, so who you are acting as is never out of sight.
    navHidden && !activeOrg ? "navbar--hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const titleText =
    pageTitle ??
    (breadcrumb
      ? [breadcrumb.left.text, breadcrumb.right?.text].filter(Boolean).join(" / ")
      : null);

  if (isTopLevel) {
    return (
      <header className={navClasses}>
        <div className="navbar__inner">
          <div className="navbar__left">
            <Link
              href={isAuthenticated ? "/home" : "/welcome"}
              className="navbar__logo"
              aria-label="Certified home"
            >
              <Brandmark size={28} decorative />
            </Link>
          </div>
          {!hasPageHeader && titleText ? (
            <h1 className="navbar__title">{titleText}</h1>
          ) : (
            <span />
          )}
          <div className="navbar__right">
            {isAuthenticated ? (
              <>
                <PhoneNewMenu />
                <PhoneAccountMenu />
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void openSignIn()}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>
    );
  }

  // Fallback detail bar (no PageHeader): back chevron + compact title, which
  // is the page's h1 (+ the record menu, if a page still publishes one).
  return (
    <header className={navClasses}>
      <div className="navbar__inner">
        <div className="navbar__left">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go back"
            onClick={() => transitionBack()}
          >
            <ChevronLeft size={24} strokeWidth={1.5} aria-hidden />
          </Button>
        </div>
        <h1 className="navbar__title">
          {breadcrumb ? (
            <>
              <Link href={breadcrumb.left.href} className="navbar__title-part">
                {breadcrumb.left.text}
              </Link>
              {breadcrumb.right ? (
                <>
                  <span className="navbar__title-sep" aria-hidden="true"> / </span>
                  <Link href={breadcrumb.right.href} className="navbar__title-part">
                    {breadcrumb.right.text}
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            pageTitle
          )}
        </h1>
        <div className="navbar__right">
          {recordMenu ? (
            <span className="navbar__action">
              <AddToListMenu
                targetUri={recordMenu.targetUri}
                targetCid={recordMenu.targetCid}
                targetType={recordMenu.targetType as TypedListType}
                shareTab={recordMenu.shareTab}
                editActions={recordMenu.editActions}
              />
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
