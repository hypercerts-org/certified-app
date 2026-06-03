"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  Award,
  Bell,
  Building2,
  User,
  Settings,
  ChevronDown,
  Info,
  LayoutGrid,
  LogIn,
  Rss,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import {
  isRouteVisibleToActor,
} from "@/lib/groups/personal-only";
import { routeForActorSwitch } from "@/lib/groups/navigation";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { usePendingAwardsCount } from "@/hooks/use-pending-awards-count";
import { useNotifications } from "@/lib/notifications-context";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import AccountSwitcherList from "./account-switcher-list";
import Brandmark from "@/components/ui/brandmark";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

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
  const router = useRouter();
  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const { activeOrg, groups, switchOrg } = useOrg();
  const { orgAvatarUrl } = useOrgProfile();
  const { count: unreadCount, more: unreadMore, ready: notificationsReady } = useNotifications();

  const unreadBadge = formatUnreadBadge(notificationsReady, unreadCount, unreadMore);

  // Pending-endorsement chip — count of un-responded badge.awards
  // targeting the viewer's profile. Closes the discovery gap from
  // default-show: a viewer who never opens Endorsements still sees
  // the chip on next page load. Hidden on the unauthed rail.
  const pendingCount = usePendingAwardsCount();
  const pendingBadge = formatPendingBadge(pendingCount);

  // Account-switcher dropdown state. The menu is portaled to <body> via the
  // canonical <Popover> (portal + side="top" + align="start") because the
  // .left-rail's overflow-y: auto would otherwise clip it — especially at the
  // 86px icon-only width where the dropdown needs to extend rightward beyond
  // the rail into the center column. The Popover primitive owns positioning,
  // click-outside, Esc-to-close (with focus-return to the trigger) and
  // re-measurement on scroll/resize.
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Close on navigation
  useEffect(() => {
    setSwitcherOpen(false);
  }, [pathname]);

  const sortedOrgs = useMemo(() => {
    return [...groups].sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      const roleA = ROLE_ORDER[a.role] ?? 3;
      const roleB = ROLE_ORDER[b.role] ?? 3;
      if (roleA !== roleB) return roleA - roleB;
      const nameA = (a.displayName || a.handle).toLowerCase();
      const nameB = (b.displayName || b.handle).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [groups]);

  // When acting as a group, identity surfaces (avatar, handle) and the
  // Profile link reflect the group, matching mobile-sidebar + navbar.
  const identity = activeOrg
    ? {
        name: activeOrg.displayName || activeOrg.handle,
        handle: activeOrg.handle,
        avatarUrl: orgAvatarUrl || activeOrg.avatarUrl || undefined,
        initials: getInitials(activeOrg.displayName || activeOrg.handle),
      }
    : {
        name: profile?.displayName,
        handle,
        avatarUrl: avatarUrl || undefined,
        initials: getInitials(profile?.displayName, did),
      };

  const profileHref = identity.handle
    ? `/profile/${encodeURIComponent(identity.handle)}`
    : "/profile";

  // Brand link points at "where I currently am" — personal profile
  // for individuals, group profile for an active-org session. The
  // personal-handle path uses `handle` (from useSession) rather than
  // `identity.handle`, which is the *group* handle when activeOrg is
  // set and would otherwise send us to /profile/<group-handle>.
  // Brand mark links to /home for signed-in viewers and to /welcome
  // once auth resolves to signed-out. While auth is still loading we
  // keep /home, whose own guard bounces an unauthenticated viewer to
  // /welcome. Org-switch acting-as state is not load-bearing here —
  // the user's mental model is "brand = home", not "brand = my profile".
  const brandHref = !isLoading && !isAuthenticated ? "/welcome" : "/home";

  // Personal-only visibility (Create, Endorsements, Groups) is decided
  // by lib/groups/personal-only.ts — same source of truth used by the
  // mobile sidebar and bottom nav. Don't open-code the org check here.
  const isActingAsOrg = !!activeOrg;
  const showEndorsements = isRouteVisibleToActor("endorsements", isActingAsOrg);
  const showGroups = isRouteVisibleToActor("groups", isActingAsOrg);
  const authedItems: NavItem[] = [
    { href: profileHref, label: "Profile", icon: User, matchPrefix: true },
    { href: "/home", label: "Home", icon: Rss, matchPrefix: true },
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
          <Image
            src="/brand/wordmark/certified_wordmark_black.svg"
            alt="Certified"
            className="left-rail__brand-wordmark-img"
            width={125}
            height={24}
            priority
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

      <div className="left-rail__bottom">
        {isAuthenticated ? (
          <>
            {/* Account-switcher — minimal avatar + handle + chevron trigger.
                Reads useOrg().activeOrg so identity reflects the acting role.
                The menu portals to <body> via the canonical <Popover> so it
                escapes the rail's overflow-y: auto clip and opens upward
                (side="top") aligned to the trigger's left edge (align="start"). */}
            <div className="account-switcher">
              <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
                <PopoverTrigger>
                  <button
                    type="button"
                    className="left-rail__switcher"
                    aria-label={`Switch account (currently ${identity.name || "anonymous"})`}
                  >
                    <Avatar
                      size="sm"
                      src={identity.avatarUrl}
                      fallbackInitials={identity.initials}
                    />
                    <span className="left-rail__switcher-meta">
                      <span className="left-rail__switcher-name">{identity.name || "Anonymous"}</span>
                      {identity.handle ? (
                        <span className="left-rail__switcher-handle">@{identity.handle}</span>
                      ) : null}
                    </span>
                    <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  portal
                  side="top"
                  align="start"
                  offset={8}
                  // Wider than the rail-bottom box so the vertical scrollbar
                  // (when the org list is long) doesn't crowd the content
                  // into a horizontal scroll. max-height + overflow preserve
                  // the base `.account-switcher__menu` scroll behaviour for a
                  // long org list (70vh cap, stable scrollbar gutter).
                  minWidth={260}
                  style={{ width: 300 }}
                  className="max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable]"
                >
                  <AccountSwitcherList
                    session={{ handle: handle ?? null }}
                    profile={profile ? { displayName: profile.displayName ?? undefined } : null}
                    avatarUrl={avatarUrl ?? undefined}
                    sortedOrgs={sortedOrgs}
                    activeOrg={activeOrg}
                    switchOrg={switchOrg}
                    onAfterSwitch={(next) => {
                      setSwitcherOpen(false);
                      router.push(routeForActorSwitch(pathname, next));
                    }}
                    onSignOut={() => {
                      setSwitcherOpen(false);
                      signOut();
                    }}
                    onSwitchAccount={() => {
                      setSwitcherOpen(false);
                      openSignIn();
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </>
        ) : (
          <div className="left-rail__signin-card">
            <p className="left-rail__signin-title">Join Certified</p>
            <p className="left-rail__signin-body">
              One identity. Your data. Every app in the network.
            </p>
            <button
              type="button"
              className="left-rail__primary"
              onClick={openSignIn}
              aria-label="Sign in"
            >
              <LogIn size={18} strokeWidth={1.75} aria-hidden />
              <span className="left-rail__primary-label">Sign in</span>
            </button>
          </div>
        )}
      </div>

    </nav>
  );
}
