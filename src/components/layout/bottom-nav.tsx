"use client";

import { usePathname, useRouter } from "next/navigation";
import { Newspaper, Search, PlusCircle, Bell, MessageSquare } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";
import { useNotifications } from "@/lib/notifications-context";
import { useOrg } from "@/lib/groups/org-context";
import { isRouteVisibleToActor } from "@/lib/groups/personal-only";
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints";
import Tooltip from "@/components/ui/tooltip";

function formatBadge(count: number, more: boolean): string | null {
  if (count <= 0) return null
  if (more || count >= 99) return "99+"
  return String(count)
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { openFeedback } = useFeedback();
  const { count, more, ready } = useNotifications();
  const { activeOrg } = useOrg();
  const { isDesktop } = useLayoutBreakpoints();
  const badge = ready ? formatBadge(count, more) : null;

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
    { key: "home", label: "Home", icon: Newspaper, onClick: handleHomeClick, active: isHome, badge: null },
    { key: "explore", label: "Explore", icon: Search, onClick: () => router.push("/explore"), active: pathname === "/explore", badge: null },
    ...(showCreate
      ? [{ key: "create", label: "Create", icon: PlusCircle, onClick: () => router.push("/create"), active: pathname === "/create", badge: null }]
      : []),
    {
      key: "notifications",
      label: "Notifications",
      icon: Bell,
      onClick: () => router.push("/notifications"),
      active: pathname === "/notifications",
      badge,
    },
    { key: "feedback", label: "Feedback", icon: MessageSquare, onClick: openFeedback, active: false, badge: null },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="bottom-nav__inner">
        {items.map(({ key, label, icon: Icon, onClick, active, badge: itemBadge }) => {
          const ariaLabel = key === "notifications" && itemBadge
            ? `${label}, ${itemBadge} unread`
            : label
          return (
            <Tooltip key={key} label={label} className="flex-1 h-full">
              <button
                className={`bottom-nav__item ${active ? "bottom-nav__item--active" : ""}`}
                onClick={onClick}
                aria-label={ariaLabel}
                aria-current={active ? "page" : undefined}
              >
                <span className="bottom-nav__icon-wrap">
                  <Icon size={24} strokeWidth={active ? 2.5 : 1.5} />
                  {itemBadge && (
                    <span className="bottom-nav__badge" aria-hidden="true">{itemBadge}</span>
                  )}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </div>
    </nav>
  );
}
