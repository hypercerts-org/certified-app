"use client"

import { FolderGit2, LayoutDashboard, ListChecks, ThumbsUp, Users, UsersRound } from "lucide-react"
import PageContainer from "@/components/ui/page-container"
import SideNav, { type SideNavIcon } from "@/components/ui/side-nav"

/**
 * The Workspace's sections, in side-list order: the Overview (`/home`) and
 * the sections that manage what the account holds (`/records?kind=…`).
 * "activities" is the projects-and-activities folder view (the key keeps
 * existing `?kind=activities` links working).
 */
export type WorkspaceSection =
  | "overview"
  | "activities"
  | "endorsements"
  | "followers"
  | "lists"
  | "groups"

export const WORKSPACE_SECTIONS: readonly {
  key: WorkspaceSection
  label: string
  href: string
  icon: SideNavIcon
}[] = [
  { key: "overview", label: "Overview", href: "/home", icon: LayoutDashboard },
  { key: "activities", label: "Projects and activities", href: "/records?kind=activities", icon: FolderGit2 },
  { key: "endorsements", label: "Endorsements", href: "/records?kind=endorsements", icon: ThumbsUp },
  { key: "followers", label: "Followers", href: "/records?kind=followers", icon: Users },
  { key: "lists", label: "Lists", href: "/records?kind=lists", icon: ListChecks },
  { key: "groups", label: "Groups", href: "/records?kind=groups", icon: UsersRound },
]

/** The label of a Workspace section, for page titles. */
export function workspaceSectionLabel(section: WorkspaceSection): string {
  return WORKSPACE_SECTIONS.find((s) => s.key === section)?.label ?? "Workspace"
}

/**
 * The Workspace frame (DESIGN.md §4): everything the signed-in account holds
 * and manages, as opposed to the network (Feed, Explore, Apps). One side
 * list of sections (a column from 1100px, one scrolling row of pills
 * above the page below that) beside the current section, which renders its
 * own `<PageHeader>` (the page's h1).
 *
 * `className` scopes the section's own rules (`home-page`, `records-page`).
 */
export default function WorkspaceShell({
  current,
  className = "",
  children,
}: {
  current: WorkspaceSection
  className?: string
  children: React.ReactNode
}) {
  return (
    // The one width of every top-level page (DESIGN.md §4.6), so switching
    // between the Workspace and the network doesn't move the content edge.
    <PageContainer className={`workspace-page ${className}`.trim()}>
      <div className="workspace__layout">
        <SideNav
          aria-label="Workspace"
          className="workspace__nav"
          overflow="scroll"
          items={WORKSPACE_SECTIONS.map(({ key, label, href, icon }) => ({
            key,
            label,
            href,
            icon,
            current: key === current,
          }))}
        />
        <div className="workspace__main">{children}</div>
      </div>
    </PageContainer>
  )
}
