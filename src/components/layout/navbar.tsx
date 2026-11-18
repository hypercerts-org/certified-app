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
import { hasPhoneChrome } from "@/lib/layout/chrome";
import { parseActor } from "@/lib/urls";
import Button from "@/components/ui/button";
import Brandmark from "@/components/ui/brandmark";
import Wordmark from "@/components/ui/wordmark";
import AddToListMenu from "@/components/lists/add-to-list-menu";
import type { TypedListType } from "@/lib/atproto/typed-lists";
import { PhoneAccountSwitcher } from "./account-switcher";
import PhoneSearch from "./phone-search";

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
 * - **Left:** the faded Certified.app wordmark on the top-level pages (Home,
 *   Feed, Explore, Records, Apps, Settings, Help and your own profile);
 *   the square brandmark instead whenever a title shares the row, so the
 *   title keeps its room. Everywhere else
 *   (a record, someone else's profile, a group page, a form) a back
 *   chevron, whether or not the page renders a `<PageHeader>`: the
 *   installed app has no browser Back, so this is the way back to where
 *   you were (your feed and its scroll position, say).
 * - **Center:** the page's title. On a top-level page with a
 *   `<PageHeader>` (Feed, Map, a Workspace section...), the header's title
 *   moves up here and the header's h1 is visually hidden on phones (this
 *   copy is plain text, hidden from assistive tech). On a page without a
 *   PageHeader, the compact title is the page's h1. Otherwise none.
 * - **Right:** on the top-level pages, Search (phone-search.tsx: the
 *   global search in a panel at the top of the screen), signed in or
 *   out, except on Explore (its own field is the search there). Then the
 *   account control (account-switcher.tsx): the avatar of
 *   the account you act as (a group's with yours on its corner), opening
 *   "Act as", "Signed in as", Help, feedback and the legal links in a
 *   sheet. "Sign in" when signed out. A page that still publishes a
 *   record menu gets it first. There is no `+`: you create from the
 *   Workspace (its sections' own New buttons).
 *
 * It's a `<header>` (the banner landmark), not a `<nav>`: it holds the
 * brand and a few buttons; the navigation is the pill at the bottom
 * (bottom-nav.tsx).
 *
 * Fixed and translucent. It hides on scroll down and returns on scroll
 * up, except for someone who can switch to a group: then it carries who
 * they act as, so it stays.
 */
const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn } = useAuth();
  const { pageTitle, breadcrumb, recordMenu, barTitle } = useNavbarValues();
  const hasPageHeader = useHasPageHeader();
  // A page header with its own back link ("‹ Records") is the way back;
  // the bar then shows the brandmark rather than a second chevron.
  const headerHasBack = useHasPageHeaderBack();
  const { handle } = useSession();
  const { activeOrg, groups, selfGroup } = useOrg();
  const pathname = usePathname();
  const { transitionBack } = useViewTransition();
  const { scrolled, navHidden } = useScrollHideNavbar();
  const { isDesktop } = useLayoutBreakpoints();

  // Not on desktop (the sidebar owns that range; CSS hides the bar there
  // too, so the server's render never shows), in embeds (bare board in a
  // third-party iframe) or on /welcome (the landing has its own minimal
  // chrome at every width). All early returns sit after every hook.
  if (isDesktop) return null;
  if (!hasPhoneChrome(pathname)) return null;

  // While sign-in resolves (and on the server) the bar already stands: the
  // brand or back chevron and the title, as they will be, with the right
  // side empty, so neither Sign in nor an avatar flashes in the wrong
  // state and nothing below moves when they arrive.
  const signedIn = !isLoading && isAuthenticated;

  // The bar carries who you act as (the account control), so for anyone
  // who can switch between themselves and a group it stays put instead of
  // hiding on scroll. An account with nothing to switch keeps the room.
  const canSwitch = signedIn && !selfGroup && groups.length > 0;

  const isOwnProfile =
    signedIn &&
    isOwnProfilePath(pathname, [
      { handle, did },
      ...(activeOrg ? [{ handle: activeOrg.handle, did: activeOrg.groupDid }] : []),
    ]);
  const isTopLevel = isTopLevelPath(pathname) || isOwnProfile;

  // The compact title is the page's h1 only while no PageHeader owns it.
  const showChromeH1 = !hasPageHeader && !!(pageTitle || breadcrumb);
  // On a top-level page the PageHeader's title moves up here (its h1 is
  // visually hidden on phones), as plain text: the h1 stays the header's.
  const headerTitle = hasPageHeader && isTopLevelPath(pathname) ? barTitle : null;
  // With a title on the row, the brandmark replaces the wordmark.
  const showTitle = showChromeH1 || !!headerTitle;

  const navClasses = [
    "navbar",
    scrolled ? "navbar--scrolled" : "",
    navHidden && !canSwitch ? "navbar--hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");


  return (
    <header className={navClasses}>
      <div className="navbar__inner">
        <div className="navbar__left">
          {isTopLevel || headerHasBack ? (
            isLoading ? (
              // Where home is depends on sign-in: the mark alone until then.
              <span
                className={`navbar__logo${showTitle ? "" : " navbar__logo--wordmark"}`}
                aria-hidden="true"
              >
                {showTitle ? (
                  <Brandmark size={28} decorative />
                ) : (
                  <Wordmark variant="certified-app" faded height={18} decorative />
                )}
              </span>
            ) : showTitle ? (
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
                <Wordmark variant="certified-app" faded height={18} decorative />
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
        {headerTitle ? (
          <p className="navbar__title" aria-hidden="true">
            {headerTitle}
          </p>
        ) : showChromeH1 ? (
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
          {isLoading ? null : recordMenu ? (
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
          {/* Not on forms (a back-link header) or detail pages: there it
              would lead away from the draft or record. Not on Explore
              either, whose own search field is right under the bar. */}
          {isLoading ? null : isTopLevel && pathname !== "/explore" ? <PhoneSearch /> : null}
          {isLoading ? null : isAuthenticated ? (
            <PhoneAccountSwitcher />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="navbar__sign-in"
              onClick={() => void openSignIn()}
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
