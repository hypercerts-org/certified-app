"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasPageHeader, useHasPageHeaderBack, useNavbarValues } from "@/lib/navbar-context";
import { useViewTransition } from "@/lib/view-transitions";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useScrollHideNavbar } from "@/hooks/use-scroll-hide-navbar";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { isTopLevelPath } from "@/lib/layout/destinations";
import { parseActor } from "@/lib/urls";
import Button from "@/components/ui/button";
import Brandmark from "@/components/ui/brandmark";
import Wordmark from "@/components/ui/wordmark";
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
 * Phone top bar (below 800px). One bar on every page:
 *
 * - **Left:** the Certified.app wordmark with its Beta pill on the top-level pages (Home,
 *   Feed, Explore, Records, Apps, Settings, Help and your own profile);
 *   the square brandmark instead when the compact title shares the row,
 *   so the title keeps its room. Everywhere else
 *   (a record, someone else's profile, a group page, a form) a back
 *   chevron, whether or not the page renders a `<PageHeader>`: the
 *   installed app has no browser Back, so this is the way back to where
 *   you were (your feed and its scroll position, say).
 * - **Center:** the compact title, as the page's h1, only when no
 *   `<PageHeader>` is mounted (the header already carries the title).
 * - **Right:** a `+` (the New menu, as a sheet) and the avatar (the
 *   account sheet), or "Sign in" when signed out. A page that still
 *   publishes a record menu gets it first.
 *
 * It's a `<header>` (the banner landmark), not a `<nav>`: it holds the
 * brand and a few buttons, not a list of links.
 *
 * Fixed, translucent, hides on scroll down and returns on scroll up — except
 * while acting as a group, when it stays put with the acting-as bar below.
 */
const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn } = useAuth();
  const { pageTitle, breadcrumb, recordMenu } = useNavbarValues();
  const hasPageHeader = useHasPageHeader();
  // A page header with its own back link ("‹ Records") is the way back;
  // the bar then shows the brandmark rather than a second chevron.
  const headerHasBack = useHasPageHeaderBack();
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
  const isTopLevel = isTopLevelPath(pathname) || isOwnProfile;

  // The compact title is the page's h1 only while no PageHeader owns it.
  const showTitle = !hasPageHeader && !!(pageTitle || breadcrumb);

  const navClasses = [
    "navbar",
    scrolled ? "navbar--scrolled" : "",
    // Acting as a group keeps the bar (and the acting-as bar under it)
    // pinned, so who you are acting as is never out of sight.
    navHidden && !activeOrg ? "navbar--hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");


  return (
    <header className={navClasses}>
      <div className="navbar__inner">
        <div className="navbar__left">
          {isTopLevel || headerHasBack ? (
            showTitle ? (
              <Link
                href={isAuthenticated ? "/home" : "/welcome"}
                className="navbar__logo"
                aria-label="Certified home"
              >
                <Brandmark size={28} decorative />
              </Link>
            ) : (
              <Link
                href={isAuthenticated ? "/home" : "/welcome"}
                className="navbar__logo navbar__logo--wordmark"
                aria-label="Certified home"
              >
                <Wordmark variant="certified-app" beta height={18} decorative />
              </Link>
            )
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Go back"
              onClick={() => transitionBack()}
            >
              <ChevronLeft size={24} strokeWidth={1.5} aria-hidden />
            </Button>
          )}
        </div>
        {showTitle ? (
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
        ) : (
          <span />
        )}
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
};

export default Navbar;
