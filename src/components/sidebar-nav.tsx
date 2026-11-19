"use client";

import { Eyebrow } from "@hypercerts-org/ui-react";
import {
  Award,
  Compass,
  FolderGit2,
  HandCoins,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
  MapIcon,
  Network,
  Newspaper,
  Search,
  Settings,
  ThumbsUp,
} from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useId, useRef, useState } from "react";
import { WORKSPACE_OVERVIEW_PATH } from "@/components/cards";
import { LinkPending } from "@/components/link-pending";

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
};

const under = (base: string) => (pathname: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

function workspaceItems(overview: string): Item[] {
  return [
    {
      label: "Overview",
      icon: LayoutDashboard,
      href: overview,
      isActive: (pathname) => WORKSPACE_OVERVIEW_PATH.test(pathname),
    },
    {
      label: "Projects and activities",
      icon: FolderGit2,
      href: `${overview}/projects`,
      isActive: under(`${overview}/projects`),
    },
    {
      label: "Endorsements",
      icon: ThumbsUp,
      href: `${overview}/endorsements`,
      isActive: under(`${overview}/endorsements`),
    },
    {
      label: "Badges",
      icon: Award,
      href: `${overview}/badges`,
      isActive: under(`${overview}/badges`),
    },
    {
      label: "Lists",
      icon: ListChecks,
      href: `${overview}/lists`,
      isActive: under(`${overview}/lists`),
    },
  ];
}

// The Feed follows your account, so it is signed-in only.
const FEED: readonly Item[] = [{ label: "Feed", icon: Newspaper, href: null }];

const NETWORK: readonly Item[] = [
  { label: "Explore", icon: Compass, href: "/explore", isActive: under("/explore") },
  { label: "Graph", icon: Network, href: null },
  { label: "Map", icon: MapIcon, href: null },
  { label: "Funding", icon: HandCoins, href: null },
];

const ECOSYSTEM: readonly Item[] = [
  { label: "Apps", icon: LayoutGrid, href: "/apps", isActive: under("/apps") },
];

const SETTINGS: readonly Item[] = [
  { label: "Settings", icon: Settings, href: "/settings", isActive: under("/settings") },
];

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
    | { group: "network" | "feed" | "ecosystem" | "settings" }
    | { group: "workspace"; overview: string },
) {
  const items =
    props.group === "workspace"
      ? workspaceItems(props.overview)
      : { network: NETWORK, feed: FEED, ecosystem: ECOSYSTEM, settings: SETTINGS }[props.group];
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
 * Search, under the account control: Explore's search, from any page.
 * Ctrl K (⌘K on Apple devices) puts the cursor in it.
 */
export function SidebarSearch() {
  const input = useRef<HTMLInputElement>(null);
  // The server can't know the platform, so the hint appears once mounted.
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
    setShortcut(/mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K");

    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Form action="/explore" role="search" className="sidebar-search">
      <Search size={16} aria-hidden className="sidebar-search-icon" />
      <input
        ref={input}
        type="search"
        name="q"
        placeholder="Search"
        aria-label="Search organizations"
        enterKeyHint="search"
        autoComplete="off"
      />
      {shortcut && (
        <kbd className="sidebar-search-kbd" aria-hidden>
          {shortcut}
        </kbd>
      )}
    </Form>
  );
}
