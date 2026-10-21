"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Newspaper, Search, PlusCircle, MessageSquare } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";
import { useOrg } from "@/lib/groups/org-context";
import { isRouteVisibleToActor } from "@/lib/groups/personal-only";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { isBottomNavVisible } from "@/lib/layout/bottom-nav-visibility";
import Tooltip from "@/components/ui/tooltip";

export default function BottomNav() {
  const pathname = usePathname();
  const { openFeedback } = useFeedback();
  const { activeOrg } = useOrg();
  const { isDesktop, isStandalone } = useLayoutBreakpoints();

  // Visibility is centralized in isBottomNavVisible so the floating
  // <FeedbackTrigger> can hide itself under the exact same conditions
  // (the bar already carries a Feedback entry). See the helper for the
  // full per-condition rationale.
  if (!isBottomNavVisible({ pathname, isDesktop, isStandalone })) return null;

  const isHome = pathname === "/home" || pathname.startsWith("/home/");

  // Re-tapping Home while already there scrolls to the top instead of
  // navigating. JS smooth scrolling isn't covered by the CSS reduced-motion
  // block, so honour the preference here.
  const handleHomeClick = (e: React.MouseEvent) => {
    if (!isHome) return;
    e.preventDefault();
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const showCreate = isRouteVisibleToActor("create", !!activeOrg);
  // Destinations are real links (long-press / open-in-new-tab / prefetch);
  // only Feedback, which opens a modal, stays a button.
  const links = [
    { key: "home", label: "Home", icon: Newspaper, href: "/home", onClick: handleHomeClick, active: isHome, tour: "nav-home" },
    { key: "explore", label: "Explore", icon: Search, href: "/explore", onClick: undefined, active: pathname === "/explore", tour: undefined },
    ...(showCreate
      ? [{ key: "create", label: "Create", icon: PlusCircle, href: "/create", onClick: undefined, active: pathname === "/create", tour: "nav-create" }]
      : []),
    { key: "apps", label: "Apps", icon: LayoutGrid, href: "/apps", onClick: undefined, active: pathname === "/apps", tour: "nav-apps" },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {links.map(({ key, label, icon: Icon, href, onClick, active, tour }) => (
          <Tooltip key={key} label={label} className="flex-1 h-full">
            <Link
              href={href}
              className={`bottom-nav__item ${active ? "bottom-nav__item--active" : ""}`}
              onClick={onClick}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              data-tour={tour}
            >
              <span className="bottom-nav__icon-wrap">
                <Icon size={24} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
              </span>
            </Link>
          </Tooltip>
        ))}
        <Tooltip label="Feedback" className="flex-1 h-full">
          <button
            type="button"
            className="bottom-nav__item"
            onClick={() => openFeedback()}
            aria-label="Feedback"
          >
            <span className="bottom-nav__icon-wrap">
              <MessageSquare size={24} strokeWidth={1.5} aria-hidden />
            </span>
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
