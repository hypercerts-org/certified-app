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
import { HelpMenu } from "@/components/help-menu";

// The Workspace's sidebar, after the staging redesign: its sections, then
// Help and Settings at the foot. The network's pages (Explore, Apps) stay in
// the top bar. Only the Overview exists so far; the other sections are shown
// dimmed, not as links, so the list has its final shape without leading
// anywhere empty.

type Section = { label: string; icon: LucideIcon; ready: boolean };

const SECTIONS: readonly Section[] = [
  { label: "Overview", icon: LayoutDashboard, ready: true },
  { label: "Projects and activities", icon: FolderGit2, ready: false },
  { label: "Endorsements", icon: ThumbsUp, ready: false },
  { label: "Lists", icon: ListChecks, ready: false },
  { label: "Groups", icon: UsersRound, ready: false },
];

/** `overview` is the workspace's own address. */
export function WorkspaceNav({ overview }: { overview: string }) {
  return (
    <nav aria-label="Workspace" className="workspace-nav">
      <Eyebrow as="p" className="workspace-nav-label">
        Workspace
      </Eyebrow>
      <ul className="workspace-nav-list">
        {SECTIONS.map(({ label, icon: Icon, ready }) => (
          <li key={label}>
            {ready ? (
              <Link href={overview} className="workspace-nav-item" aria-current="page">
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
