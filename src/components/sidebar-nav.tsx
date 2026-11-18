"use client";

import {
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
  UsersRound,
} from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { WORKSPACE_OVERVIEW_PATH, workspaceHref } from "@/components/cards";
import { HelpMenu } from "@/components/help-menu";
import { LinkPending } from "@/components/link-pending";
import { SignInButton } from "@/components/sign-in-button";
import { type Account, SidebarAccountMenu } from "@/components/site-nav";

// The sidebar's contents, after the staging redesign: whom you act as, the
// search, then the app's pages in three groups (Workspace, Network,
// Ecosystem), with Help and Settings at the foot. Pages not built yet are
// shown dimmed, not as links, so the list has its final shape without
// leading anywhere empty.

type Item = {
  label: string;
  icon: LucideIcon;
  /** Where it leads, or null while the page isn't built. */
  href: string | null;
  isActive?: (pathname: string) => boolean;
  signedInOnly?: boolean;
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
    { label: "Lists", icon: ListChecks, href: null },
    { label: "Groups", icon: UsersRound, href: null },
  ];
}

const NETWORK: readonly Item[] = [
  // The Feed follows your account, so it is signed-in only.
  { label: "Feed", icon: Newspaper, href: null, signedInOnly: true },
  { label: "Explore", icon: Compass, href: "/explore", isActive: under("/explore") },
  { label: "Graph", icon: Network, href: null },
  { label: "Map", icon: MapIcon, href: null },
  { label: "Funding", icon: HandCoins, href: null },
];

const ECOSYSTEM: readonly Item[] = [
  { label: "Apps", icon: LayoutGrid, href: "/apps", isActive: under("/apps") },
];

function Row({ item, pathname }: { item: Item; pathname: string }) {
  const { label, icon: Icon, href } = item;
  if (!href) {
    return (
      <span className="sidebar-item" aria-disabled="true" title="Coming soon">
        <Icon size={20} strokeWidth={1.5} aria-hidden />
        {label}
        <span className="visually-hidden"> (coming soon)</span>
      </span>
    );
  }
  const active = item.isActive?.(pathname) ?? false;
  return (
    <Link prefetch href={href} className="sidebar-item" aria-current={active ? "page" : undefined}>
      <Icon size={20} strokeWidth={active ? 2 : 1.5} aria-hidden />
      {label}
      <LinkPending />
    </Link>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="sidebar-group">
      <p id={id} className="sidebar-group-label">
        {label}
      </p>
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
function SidebarSearch() {
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

export function SidebarNav({ account }: { account: Account | null }) {
  const pathname = decodeURIComponent(usePathname());
  const visible = (item: Item) => account || !item.signedInOnly;

  return (
    <>
      <div className="sidebar-account-slot">
        {account ? <SidebarAccountMenu account={account} /> : <SignInButton />}
      </div>
      <SidebarSearch />
      <nav aria-label="Main" className="sidebar-nav">
        {account && (
          <Group label="Workspace">
            {workspaceItems(workspaceHref(account.actingAs?.did ?? account.did)).map((item) => (
              <li key={item.label}>
                <Row item={item} pathname={pathname} />
              </li>
            ))}
          </Group>
        )}
        <Group label="Network">
          {NETWORK.filter(visible).map((item) => (
            <li key={item.label}>
              <Row item={item} pathname={pathname} />
            </li>
          ))}
        </Group>
        <Group label="Ecosystem">
          {ECOSYSTEM.map((item) => (
            <li key={item.label}>
              <Row item={item} pathname={pathname} />
            </li>
          ))}
        </Group>
      </nav>
      <ul className="sidebar-list sidebar-foot">
        <li>
          <HelpMenu className="sidebar-item" />
        </li>
        {account && (
          <li>
            <Row
              item={{
                label: "Settings",
                icon: Settings,
                href: "/settings",
                isActive: under("/settings"),
              }}
              pathname={pathname}
            />
          </li>
        )}
      </ul>
    </>
  );
}
