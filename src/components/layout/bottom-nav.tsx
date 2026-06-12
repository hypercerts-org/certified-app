"use client";

import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Newspaper, Search, PlusCircle, MessageSquare } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";
import { useOrg } from "@/lib/groups/org-context";
import { isRouteVisibleToActor } from "@/lib/groups/personal-only";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import Tooltip from "@/components/ui/tooltip";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { openFeedback } = useFeedback();
  const { activeOrg } = useOrg();
  const { isDesktop } = useLayoutBreakpoints();

  // Unmount at ≥800px — the left rail is the primary nav on desktop and
  // bottom-nav's focusable buttons would compete for tab order.
  if (isDesktop) return null;

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
    { key: "home", label: "Home", icon: Newspaper, onClick: handleHomeClick, active: isHome },
    { key: "explore", label: "Explore", icon: Search, onClick: () => router.push("/explore"), active: pathname === "/explore" },
    ...(showCreate
      ? [{ key: "create", label: "Create", icon: PlusCircle, onClick: () => router.push("/create"), active: pathname === "/create" }]
      : []),
    { key: "apps", label: "Apps", icon: LayoutGrid, onClick: () => router.push("/apps"), active: pathname === "/apps" },
    { key: "feedback", label: "Feedback", icon: MessageSquare, onClick: openFeedback, active: false },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {items.map(({ key, label, icon: Icon, onClick, active }) => (
          <Tooltip key={key} label={label} className="flex-1 h-full">
            <button
              className={`bottom-nav__item ${active ? "bottom-nav__item--active" : ""}`}
              onClick={onClick}
              aria-label={label}
              aria-current={active ? "page" : undefined}
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
