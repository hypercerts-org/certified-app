"use client"

import { createContext, useContext } from "react"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import {
  WORKSPACE_SECTIONS,
  workspaceSectionLabel,
  type WorkspaceSection,
} from "@/lib/layout/nav-items"

// The section list lives in lib/layout/nav-items (shared with the app
// sidebar); re-exported for the pages that import it from here.
export { WORKSPACE_SECTIONS, workspaceSectionLabel, type WorkspaceSection }

/** The section the shell frames, for `WorkspaceFrame`'s side list. */
const WorkspaceSectionContext = createContext<WorkspaceSection | null>(null)

/**
 * The Workspace (DESIGN.md §4): everything the signed-in account holds and
 * manages, as opposed to the network (Feed, Explore, Apps). The shell is
 * the page container and names the current section; every state of a
 * section (loading, signed out, acting as a group, a failed load, the
 * section itself) renders its content through `WorkspaceFrame`, which
 * puts the section's title over it.
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
 * The one frame of the Workspace pages: the section's name as the page
 * title (a `<PageHeader>`, as the Network's pages have), then the section.
 * The Workspace's sections are listed by the navigation, never on the
 * page: the full sidebar's Workspace group from 1300px, the rail's
 * Workspace menu below that, the pill's on phones. The Overview has no
 * title: its h1 is the account name heading its ID box.
 *
 * Each section keeps its own `<section aria-labelledby>` in `children`,
 * pointing at `titleId`; its actions sit in its tab row.
 */
export function WorkspaceFrame({
  titleId,
  children,
}: {
  /** The id of the section's h1, for its `<section aria-labelledby>`. */
  titleId?: string
  children: React.ReactNode
}) {
  const current = useContext(WorkspaceSectionContext)
  if (current === null) {
    throw new Error("WorkspaceFrame must be rendered inside WorkspaceShell")
  }
  return (
    <>
      {current !== "overview" ? <PageHeader title={workspaceSectionLabel(current)} titleId={titleId} /> : null}
      <div className="workspace__main">{children}</div>
    </>
  )
}
