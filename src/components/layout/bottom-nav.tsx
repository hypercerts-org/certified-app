"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, FolderOpen, LayoutGrid, Menu, MessageSquare, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useFeedback } from "@/lib/feedback-context";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { useRouteScopedOpen } from "@/hooks/use-route-scoped-open";
import { isBottomNavVisible } from "@/lib/layout/bottom-nav-visibility";
import { DESTINATIONS, isDestinationActive } from "@/lib/layout/destinations";
import BottomSheet from "@/components/ui/bottom-sheet";
import { MENU_ICON_CLASS, MENU_SEPARATOR_CLASS, menuRowClass } from "./menu-row";
import { PhoneNetworkTab } from "./network-menu";

const WORKSPACE = DESTINATIONS.find((d) => d.key === "workspace")!;

/**
 * The phone navigation (below 800px): a small floating pill at the bottom,
 * in every phone browser, installed app or not.
 *
 *   ( [Workspace] [Network] [Apps] [More] )
 *
 *  - **Workspace**: the Overview. Always the folder icon: who you act as
 *    is the account control in the top bar, the one mark.
 *  - **Network**: opens its five pages as a sheet (network-menu.tsx), so
 *    Explore, Map and Funding stay one tap away.
 *  - **Apps**.
 *  - **More**: Help, Settings, feedback and the legal links, as a sheet.
 *
 * Signed out: Network, Apps and More. The desktop sidebar holds the same
 * destinations (app-sidebar.tsx).
 *
 * Each item is a 22px icon over a one-word label, at least 44px tall.
 * Re-tapping the current item on its own page scrolls back to the top.
 * The pill floats `--bottom-pill-gap` above the safe area; together they
 * are `--bottom-nav-height` (tokens.css), which bottom-pinned UI and the
 * content padding clear. Hidden on forms, /welcome, /embed and desktop
 * (bottom-nav-visibility.ts).
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useAuth();
  const { isDesktop } = useLayoutBreakpoints();

  if (!isBottomNavVisible({ pathname, isDesktop })) return null;

  // JS smooth scrolling isn't covered by the CSS reduced-motion block, so
  // honour the preference here.
  const scrollToTop = () => {
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const tab = (href: string, label: string, Icon: typeof FolderOpen, active: boolean, tour: string) => (
    <Link
      href={href}
      className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
      onClick={(e) => {
        if (pathname !== href) return;
        e.preventDefault();
        scrollToTop();
      }}
      aria-current={active ? "page" : undefined}
      data-tour={tour}
    >
      <span className="bottom-nav__icon-wrap">
        <Icon size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
      </span>
      <span className="bottom-nav__label">{label}</span>
    </Link>
  );

  // While auth resolves the pill keeps its place but shows no items, so
  // the signed-out set never flashes. The fade behind it keeps text that
  // scrolls under it from fighting its labels.
  return (
    <>
    <div className="bottom-nav-fade" aria-hidden />
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {isLoading ? null : (
          <>
            {isAuthenticated
              ? tab(WORKSPACE.href, "Workspace", FolderOpen, isDestinationActive(WORKSPACE, pathname), "nav-workspace")
              : null}
            <PhoneNetworkTab isAuthenticated={isAuthenticated} />
            {tab("/apps", "Apps", LayoutGrid, isDestinationActive({ href: "/apps" }, pathname), "nav-apps")}
            <PhoneMoreTab isAuthenticated={isAuthenticated} />
          </>
        )}
      </div>
    </nav>
    </>
  );
}

/**
 * The pill's More: Help, Settings and feedback, then the legal links, in
 * a sheet. Only what isn't already one tap away; who you are and switching
 * are the account control's (top bar).
 */
function PhoneMoreTab({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useRouteScopedOpen();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { openFeedback } = useFeedback();
  const active =
    isDestinationActive({ href: "/help" }, pathname) || isDestinationActive({ href: "/settings" }, pathname);
  const close = () => setOpen(false);
  const row = menuRowClass("sheet");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="bottom-nav__icon-wrap">
          <Menu size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
        </span>
        <span className="bottom-nav__label">More</span>
      </button>
      <BottomSheet open={open} onClose={close} title="More" returnFocusRef={triggerRef}>
        <div className="flex flex-col gap-0.5 px-2 pb-4">
          <Link href="/help" className={row} onClick={close} aria-current={pathname === "/help" ? "page" : undefined}>
            <CircleHelp size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
            Help
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                href="/settings"
                className={row}
                onClick={close}
                aria-current={pathname === "/settings" ? "page" : undefined}
              >
                <Settings size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
                Settings
              </Link>
              <button
                type="button"
                className={row}
                onClick={() => {
                  close();
                  openFeedback();
                }}
              >
                <MessageSquare size={16} strokeWidth={1.75} className={MENU_ICON_CLASS} aria-hidden />
                Send feedback
              </button>
            </>
          ) : null}
          <hr className={MENU_SEPARATOR_CLASS} />
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-1 text-caption">
            {[
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
              { href: "/imprint", label: "Imprint" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                className="inline-flex min-h-control-md items-center text-[var(--fg-muted)] no-underline hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </BottomSheet>
    </>
  );
}
