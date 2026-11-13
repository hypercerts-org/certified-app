"use client"

import { createContext, useContext } from "react"
import { FolderGit2, LayoutDashboard, ListChecks, ThumbsUp, Users, UsersRound } from "lucide-react"
import PageContainer from "@/components/ui/page-container"
import SideNav, { SIDE_NAV_CONTENT_OFFSET, type SideNavIcon } from "@/components/ui/side-nav"

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
  /** The line under the section's title (its `<PageHeader>`). The
   *  Overview's header is the account itself, so it has none. */
  description?: string
}[] = [
  { key: "overview", label: "Overview", href: "/home", icon: LayoutDashboard },
  {
    key: "activities",
    label: "Projects and activities",
    href: "/records?kind=activities",
    icon: FolderGit2,
    description: "Each project is a folder of its activities. One activity can sit in several projects.",
  },
  {
    key: "endorsements",
    label: "Endorsements",
    href: "/records?kind=endorsements",
    icon: ThumbsUp,
    description: "Endorsements you gave and received, and your lists of endorsed accounts.",
  },
  {
    key: "followers",
    label: "Followers",
    href: "/records?kind=followers",
    icon: Users,
    description:
      "Accounts that follow you, and accounts you follow. What the accounts you follow publish shows in your feed.",
  },
  {
    key: "lists",
    label: "Lists",
    href: "/records?kind=lists",
    icon: ListChecks,
    description:
      "Your lists of activities, projects, accounts and endorsements. Open a list to rename, delete or add to it.",
  },
  {
    key: "groups",
    label: "Groups",
    href: "/records?kind=groups",
    icon: UsersRound,
    description: "Groups you belong to. Switch to one to act as it, or open its profile.",
  },
]

/** The label of a Workspace section, for page titles. */
export function workspaceSectionLabel(section: WorkspaceSection): string {
  return WORKSPACE_SECTIONS.find((s) => s.key === section)?.label ?? "Workspace"
}

/** The description under a Workspace section's title, if it has one. */
export function workspaceSectionDescription(section: WorkspaceSection): string | undefined {
  return WORKSPACE_SECTIONS.find((s) => s.key === section)?.description
}

/** The section the shell frames, for `WorkspaceFrame`'s side list. */
const WorkspaceSectionContext = createContext<WorkspaceSection | null>(null)

/**
 * The Workspace (DESIGN.md §4): everything the signed-in account holds and
 * manages, as opposed to the network (Feed, Explore, Apps). The shell is
 * the page container and names the current section; every state of a
 * section (loading, signed out, acting as a group, a failed load, the
 * section itself) renders its content through `WorkspaceFrame`, which
 * lays out the header and the side list.
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
    <WorkspaceSectionContext.Provider value={current}>
      {/* The one width of every top-level page (DESIGN.md §4.6), so
          switching between the Workspace and the network doesn't move
          the content edge. */}
      <PageContainer className={`workspace-page ${className}`.trim()}>{children}</PageContainer>
    </WorkspaceSectionContext.Provider>
  )
}

/**
 * The one "side list + content" frame (DESIGN.md §9.13), as on Settings
 * and Help: the section's header (its `<PageHeader>`, the page's h1) full
 * width, then the Workspace side list and the content starting on one
 * line. From 1100px the list is a column; below that it is one scrolling
 * row of pills between the header and the content. The Overview has no
 * header: its account name (the h1) heads the ID box in the content.
 *
 * The header is passed in (not portalled) so the server renders it, and
 * the section keeps its own `<section aria-labelledby>` in `children`,
 * pointing at the header's title id.
 */
export function WorkspaceFrame({
  header,
  offset = true,
  children,
}: {
  /** The section's `<PageHeader>`; a placeholder while it loads. Leave it
   *  out when the content carries the page's h1 (the Overview). */
  header?: React.ReactNode
  /**
   * From 1100px, push the content down by `SIDE_NAV_CONTENT_OFFSET` so a
   * section heading (`text-section`) at its top sits level with the first
   * side-list label. Pass false when the content opens with a tab strip or
   * a row of controls instead: their labels already sit on that line.
   * @default true
   */
  offset?: boolean
  children: React.ReactNode
}) {
  const current = useContext(WorkspaceSectionContext)
  if (current === null) {
    throw new Error("WorkspaceFrame must be rendered inside WorkspaceShell")
  }
  return (
    <>
      {header != null ? <div className="workspace__header">{header}</div> : null}
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
        <div className={offset ? `workspace__main ${SIDE_NAV_CONTENT_OFFSET}` : "workspace__main"}>
          {children}
        </div>
      </div>
    </>
  )
}
