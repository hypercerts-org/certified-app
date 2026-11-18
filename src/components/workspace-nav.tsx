"use client";

import { Eyebrow } from "@hypercerts-org/ui-react";
import {
  FolderGit2,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Settings,
  ThumbsUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpMenu } from "@/components/help-menu";

// The Workspace's sidebar, after the staging redesign: its sections, then
// Help and Settings at the foot. The network's pages (Explore, Apps) stay in
// the top bar. Sections not built yet are shown dimmed, not as links, so the
// list has its final shape without leading anywhere empty.

/** `path` is under the workspace's address ("" for the Overview); null while not built. */
type Section = { label: string; icon: LucideIcon; path: string | null };

const SECTIONS: readonly Section[] = [
  { label: "Overview", icon: LayoutDashboard, path: "" },
  { label: "Projects and activities", icon: FolderGit2, path: "/projects" },
  { label: "Endorsements", icon: ThumbsUp, path: null },
  { label: "Lists", icon: ListChecks, path: null },
  { label: "Groups", icon: UsersRound, path: null },
];

/** `overview` is the workspace's own address. */
export function WorkspaceNav({ overview }: { overview: string }) {
  return <WorkspaceNavView overview={overview} pathname={decodeURIComponent(usePathname())} />;
}

/** The nav for a known path; with no path (before the URL is read), nothing is marked current. */
export function WorkspaceNavView({ overview, pathname }: { overview: string; pathname?: string }) {
  return (
    <nav aria-label="Workspace" className="workspace-nav">
      <Eyebrow as="p" className="workspace-nav-label">
        Workspace
      </Eyebrow>
      <ul className="workspace-nav-list">
        {SECTIONS.map(({ label, icon: Icon, path }) => (
          <li key={label}>
            {path !== null ? (
              <Link
                prefetch
                href={`${overview}${path}`}
                className="workspace-nav-item"
                aria-current={pathname === `${overview}${path}` ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden />
                {label}
              </Link>
            ) : (
              <span className="workspace-nav-item" aria-disabled="true" title="Coming soon">
                <Icon size={20} strokeWidth={1.5} aria-hidden />
                {label}
                <span className="visually-hidden"> (coming soon)</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <ul className="workspace-nav-list workspace-nav-foot">
        <li>
          <HelpMenu className="workspace-nav-item" />
        </li>
        <li>
          <Link href="/settings" className="workspace-nav-item">
            <Settings size={20} strokeWidth={1.5} aria-hidden />
            Settings
          </Link>
        </li>
      </ul>
    </nav>
  );
}
