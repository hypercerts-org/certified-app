"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Newspaper, Search, PlusCircle, MessageSquare } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";
import { useOrg } from "@/lib/groups/org-context";
import { isRouteVisibleToActor } from "@/lib/groups/personal-only";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import { isBottomNavVisible } from "@/lib/layout/bottom-nav-visibility";
import Tooltip from "@/components/ui/tooltip";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { openFeedback } = useFeedback();
  const { activeOrg } = useOrg();
  const { isDesktop, isStandalone } = useLayoutBreakpoints();

  // Visibility is centralized in isBottomNavVisible so the floating
  // <FeedbackTrigger> can hide itself under the exact same conditions
  // (the bar already carries a Feedback entry). See the helper for the
  // full per-condition rationale.
  if (!isBottomNavVisible({ pathname, isDesktop, isStandalone })) return null;

  const isHome = pathname === "/home" || pathname.startsWith("/home/");

  const handleHomeClick = () => {
    if (isHome) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push("/home");
    }
  };

  const showCreate = isRouteVisibleToActor("create", !!activeOrg);
  const items = [
    { key: "home", label: "Home", icon: Newspaper, onClick: handleHomeClick, active: isHome, tour: "nav-home" },
    { key: "explore", label: "Explore", icon: Search, onClick: () => router.push("/explore"), active: pathname === "/explore", tour: undefined },
    ...(showCreate
      ? [{ key: "create", label: "Create", icon: PlusCircle, onClick: () => router.push("/create"), active: pathname === "/create", tour: "nav-create" }]
      : []),
    { key: "apps", label: "Apps", icon: LayoutGrid, onClick: () => router.push("/apps"), active: pathname === "/apps", tour: "nav-apps" },
    { key: "feedback", label: "Feedback", icon: MessageSquare, onClick: () => openFeedback(), active: false, tour: undefined },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {items.map(({ key, label, icon: Icon, onClick, active, tour }) => (
          <Tooltip key={key} label={label} className="flex-1 h-full">
            <button
              className={`bottom-nav__item ${active ? "bottom-nav__item--active" : ""}`}
              onClick={onClick}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              data-tour={tour}
            >
              <span className="bottom-nav__icon-wrap">
                <Icon size={24} strokeWidth={active ? 2.5 : 1.5} />
              </span>
            </button>
          </Tooltip>
        ))}
      </div>
    </nav>
  );
}
