import {
  FolderGit2,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  ThumbsUp,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

// The Workspace's sections, in the staging redesign's order. Only the
// Overview exists so far; the others are shown dimmed, not as links, so the
// list has its final shape without leading anywhere empty.

type Section = { label: string; icon: LucideIcon; ready: boolean };

const SECTIONS: readonly Section[] = [
  { label: "Overview", icon: LayoutDashboard, ready: true },
  { label: "Projects and activities", icon: FolderGit2, ready: false },
  { label: "Endorsements", icon: ThumbsUp, ready: false },
  { label: "Followers", icon: Users, ready: false },
  { label: "Lists", icon: ListChecks, ready: false },
  { label: "Groups", icon: UsersRound, ready: false },
];

/** The side list of a workspace's sections; `overview` is the workspace's address. */
export function WorkspaceNav({ overview }: { overview: string }) {
  return (
    <nav aria-label="Workspace" className="workspace-nav">
      <ul>
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
    </nav>
  );
}
