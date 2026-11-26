"use client";

import { Eyebrow } from "@hypercerts-org/ui-react";
import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { HelpMenu } from "@/components/help-menu";
import { LinkPending } from "@/components/link-pending";
import { WORKSPACE_SECTIONS } from "@/components/workspace-sections";

// The Workspace's sidebar, after the staging redesign: its sections, then
// Help and Settings at the foot. The network's pages (Explore, Apps) stay in
// the top bar. Sections not built yet are shown dimmed, not as links, so the
// list has its final shape without leading anywhere empty.

/** `overview` is the workspace's own address. */
export function WorkspaceNav({
  overview,
  settingsHref = "/settings",
  settingsLabel = "Settings",
  badgesBadge,
}: {
  overview: string;
  settingsHref?: string;
  settingsLabel?: string;
  badgesBadge?: ReactNode;
}) {
  return (
    <WorkspaceNavView
      overview={overview}
      settingsHref={settingsHref}
      settingsLabel={settingsLabel}
      pathname={decodeURIComponent(usePathname())}
      badgesBadge={badgesBadge}
    />
  );
}

/** The nav for a known path; with no path (before the URL is read), nothing is marked current. */
export function WorkspaceNavView({
  overview,
  settingsHref = "/settings",
  settingsLabel = "Settings",
  pathname,
  badgesBadge,
}: {
  overview: string;
  settingsHref?: string;
  settingsLabel?: string;
  pathname?: string;
  badgesBadge?: ReactNode;
}) {
  return (
    <nav aria-label="Workspace" className="workspace-nav">
      <Eyebrow as="p" className="workspace-nav-label">
        Workspace
      </Eyebrow>
      <ul className="workspace-nav-list">
        {WORKSPACE_SECTIONS.map(({ label, icon: Icon, path }) => (
          <li key={label}>
            <Link
              prefetch
              href={`${overview}${path}`}
              className="workspace-nav-item"
              aria-current={
                pathname === `${overview}${path}` ||
                (path !== "" && pathname?.startsWith(`${overview}${path}/`))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden />
              {label}
              {path === "/badges" && badgesBadge}
              <LinkPending />
            </Link>
          </li>
        ))}
      </ul>
      <ul className="workspace-nav-list workspace-nav-foot">
        <li>
          <HelpMenu className="workspace-nav-item" />
        </li>
        <li>
          <Link prefetch href={settingsHref} className="workspace-nav-item">
            <Settings size={20} strokeWidth={1.5} aria-hidden />
            {settingsLabel}
            <LinkPending />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
