"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Award,
  Bell,
  Building2,
  User,
  Settings,
  Info,
  LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { resolvePostSwitchPath } from "@/lib/groups/navigation";
import { isRouteVisibleToActor } from "@/lib/groups/personal-only";
import { usePendingAwardsCount } from "@/hooks/use-pending-awards-count";
import { useNotifications } from "@/lib/notifications-context";
import Brandmark from "@/components/ui/brandmark";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string | null;
  /** Word screen readers say after the badge count. Different
   *  surfaces have different meanings: notifications use "unread",
   *  Endorsements uses "pending". Defaults to "unread" because
   *  Notifications is the historical user. */
  badgeUnit?: string;
  matchPrefix?: boolean;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.matchPrefix) return pathname.startsWith(item.href);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function formatUnreadBadge(ready: boolean, count: number, more: boolean): string | null {
  if (!ready || count <= 0) return null;
  if (more || count >= 99) return "99+";
  return String(count);
}

/** Format the pending-endorsement count for the Endorsements nav chip.
 *  `null` while loading (count is null) — keeps the chip hidden during
 *  the cold scan rather than briefly flashing "0". */
function formatPendingBadge(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  if (count >= 99) return "99+";
  return String(count);
}

export default function DesktopLeftRail() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { handle } = useSession();
  const { activeOrg } = useOrg();
  const { count: unreadCount, more: unreadMore, ready: notificationsReady } = useNotifications();

  const unreadBadge = formatUnreadBadge(notificationsReady, unreadCount, unreadMore);

  // Pending-endorsement chip — count of un-responded badge.awards
  // targeting the viewer's profile. Closes the discovery gap from
  // default-show: a viewer who never opens Endorsements still sees
  // the chip on next page load. Hidden on the unauthed rail.
  const pendingCount = usePendingAwardsCount();
  const pendingBadge = formatPendingBadge(pendingCount);

  // When acting as a group, the Profile link reflects the group's
  // handle, matching mobile-sidebar + navbar.
  const profileHandle = activeOrg ? activeOrg.handle : handle;
  const profileHref = profileHandle
    ? `/profile/${encodeURIComponent(profileHandle)}`
    : "/profile";

  // Brand link points at "where I currently am" — personal profile
  // for individuals, group profile for an active-org session. The
  // personal-handle path uses `handle` (from useSession) rather than
  // `identity.handle`, which is the *group* handle when activeOrg is
  // set and would otherwise send us to /profile/<group-handle>.
  const brandHref = !isAuthenticated
    ? "/"
    : activeOrg
      ? resolvePostSwitchPath(activeOrg)
      : handle
        ? `/profile/${encodeURIComponent(handle)}`
        : "/profile";

  // Personal-only visibility (Create, Endorsements, Groups) is decided
  // by lib/groups/personal-only.ts — same source of truth used by the
  // mobile sidebar and bottom nav. Don't open-code the org check here.
  const isActingAsOrg = !!activeOrg;
  const showEndorsements = isRouteVisibleToActor("endorsements", isActingAsOrg);
  const showGroups = isRouteVisibleToActor("groups", isActingAsOrg);
  const authedItems: NavItem[] = [
    { href: profileHref, label: "Profile", icon: User, matchPrefix: true },
    { href: "/search", label: "Explore", icon: Search },
    ...(showEndorsements
      ? [{ href: "/endorsements", label: "Endorsements", icon: Award, badge: pendingBadge, badgeUnit: "pending", matchPrefix: true }]
      : []),
    { href: "/notifications", label: "Notifications", icon: Bell, badge: unreadBadge, matchPrefix: true },
    ...(showGroups
      ? [{ href: "/groups", label: "Groups", icon: Building2, matchPrefix: true }]
      : []),
    { href: "/apps", label: "Apps", icon: LayoutGrid, matchPrefix: true },
    { href: "/settings", label: "Settings", icon: Settings, matchPrefix: true },
  ];

  const unauthedItems: NavItem[] = [
    { href: "/search", label: "Explore", icon: Search },
    { href: "/apps", label: "Apps", icon: LayoutGrid, matchPrefix: true },
    { href: "/about", label: "About", icon: Info },
  ];

  const items = isAuthenticated ? authedItems : unauthedItems;

  return (
    <nav
      className="left-rail"
      aria-label="Primary"
    >
      <Link href={brandHref} className="left-rail__brand" aria-label="Certified home">
        {/* Brandmark at icon-only width (86px rail); wordmark at full
            width (≥1300px). One of the two is hidden via CSS. */}
        <span className="left-rail__brand-icon">
          <Brandmark size={28} className="left-rail__brand-mark" />
        </span>
        <span className="left-rail__brand-wordmark">
          <img
            src="/brand/wordmark/certified_wordmark_black.svg"
            alt="Certified"
            className="left-rail__brand-wordmark-img"
            width={125}
            height={24}
          />
        </span>
      </Link>
      <ul className="left-rail__list">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="left-rail__item">
              <Link
                href={item.href}
                className={`left-rail__link ${active ? "left-rail__link--active" : ""}`}
                aria-current={active ? "page" : undefined}
                aria-label={
                  item.badge
                    ? `${item.label}, ${item.badge} ${item.badgeUnit ?? "unread"}`
                    : item.label
                }
              >
                <span className="left-rail__icon">
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.5} aria-hidden />
                  {item.badge ? (
                    <span className="left-rail__badge" aria-hidden="true">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="left-rail__label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

    </nav>
  );
}
