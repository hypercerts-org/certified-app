"use client";

import { Eyebrow } from "@hypercerts-org/ui-react";
import {
  Compass,
  HandCoins,
  LayoutGrid,
  type LucideIcon,
  MapIcon,
  Network,
  Newspaper,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useId } from "react";
import { WORKSPACE_OVERVIEW_PATH } from "@/components/cards";
import { GlobalSidebarSearch } from "@/components/global-search";
import { LinkPending } from "@/components/link-pending";
import { WORKSPACE_SECTIONS } from "@/components/workspace-sections";

// The sidebar's pieces, after the staging redesign: the search, then the
// app's pages in groups (Workspace, Network, Ecosystem), with Help and
// Settings at the foot. Pages not built yet are shown dimmed, not as links,
// so the list has its final shape without leading anywhere empty. What is the
// same for everyone renders at once; app-sidebar.tsx streams in the few
// pieces that depend on who is signed in.

type Item = {
  label: string;
  icon: LucideIcon;
  /** Where it leads, or null while the page isn't built. */
  href: string | null;
  isActive?: (pathname: string) => boolean;
  /** Streamed notification pill shown at the end of the row (e.g. unclaimed badges). */
  badge?: ReactNode;
};

const under = (base: string) => (pathname: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

function workspaceItems(overview: string, badgesBadge?: ReactNode): Item[] {
  return WORKSPACE_SECTIONS.map(({ label, icon, path }) => ({
    label,
    icon,
    href: `${overview}${path}`,
    isActive:
      path === ""
        ? (pathname: string) => WORKSPACE_OVERVIEW_PATH.test(pathname)
        : under(`${overview}${path}`),
    badge: path === "/badges" ? badgesBadge : undefined,
  }));
}

// The Feed follows your account, so it is signed-in only.
const FEED: readonly Item[] = [
  { label: "Feed", icon: Newspaper, href: "/feed", isActive: under("/feed") },
];

const NETWORK: readonly Item[] = [
  { label: "Explore", icon: Compass, href: "/explore", isActive: under("/explore") },
  { label: "Graph", icon: Network, href: null },
  { label: "Map", icon: MapIcon, href: null },
  { label: "Funding", icon: HandCoins, href: null },
];

const ECOSYSTEM: readonly Item[] = [
  { label: "Apps", icon: LayoutGrid, href: "/apps", isActive: under("/apps") },
];

function settingsItems(href = "/settings", label = "Settings"): Item[] {
  return [{ label, icon: Settings, href, isActive: under(href) }];
}

function Row({ item, pathname }: { item: Item; pathname: string | null }) {
  const { label, icon: Icon, href } = item;
  if (!href) {
    return (
      <span className="sidebar-item" aria-disabled="true" title="Coming soon">
        <Icon size={18} strokeWidth={1.5} aria-hidden />
        {label}
        <span className="visually-hidden"> (coming soon)</span>
      </span>
    );
  }
  const active = (pathname !== null && item.isActive?.(pathname)) || false;
  return (
    <Link prefetch href={href} className="sidebar-item" aria-current={active ? "page" : undefined}>
      <Icon size={18} strokeWidth={active ? 2 : 1.5} aria-hidden />
      {label}
      {item.badge}
      <LinkPending />
    </Link>
  );
}

function RowsView({ items, pathname }: { items: readonly Item[]; pathname: string | null }) {
  return items.map((item) => (
    <li key={item.label}>
      <Row item={item} pathname={pathname} />
    </li>
  ));
}

function RowsHere({ items }: { items: readonly Item[] }) {
  return <RowsView items={items} pathname={decodeURIComponent(usePathname())} />;
}

/**
 * One group's rows. The page marks its own row once the path is read; until
 * then (prerendering) the same rows show, none marked, so nothing moves.
 */
export function SidebarRows(
  props:
    | { group: "network" | "feed" | "ecosystem" }
    | { group: "settings"; href?: string; label?: string }
    | { group: "workspace"; overview: string; badgesBadge?: ReactNode },
) {
  const items =
    props.group === "workspace"
      ? workspaceItems(props.overview, props.badgesBadge)
      : props.group === "settings"
        ? settingsItems(props.href, props.label)
        : { network: NETWORK, feed: FEED, ecosystem: ECOSYSTEM }[props.group];
  return (
    <Suspense fallback={<RowsView items={items} pathname={null} />}>
      <RowsHere items={items} />
    </Suspense>
  );
}

export function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="sidebar-group">
      <Eyebrow as="p" id={id} className="sidebar-group-label">
        {label}
      </Eyebrow>
      <ul className="sidebar-list" aria-labelledby={id}>
        {children}
      </ul>
    </div>
  );
}

/**
 * Search, under the account control: live global search across accounts,
 * projects and activities, with Ctrl K (⌘K on Apple devices) shortcut.
 */
export function SidebarSearch() {
  return <GlobalSidebarSearch />;
}
