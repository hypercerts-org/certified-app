"use client"

import { createContext, useContext } from "react"
import PageContainer from "@/components/ui/page-container"
import SideNav, { SIDE_NAV_CONTENT_OFFSET } from "@/components/ui/side-nav"
import { useRegisterPageHeader } from "@/lib/navbar-context"
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
 * lays out the side list and the page's h1.
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

/** The section's name as the page's h1. On phones it is the page title
 *  (the pill's Workspace menu lists the sections, so the page has no list
 *  to name it); from 800px the side list or the sidebar shows it, so it is
 *  for screen readers only. It registers like a `<PageHeader>`, so the
 *  chrome adds no h1 of its own. */
function WorkspaceTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  useRegisterPageHeader()
  return (
    <h1
      id={id}
      className="mb-4 mt-0 font-headline text-h2 text-[var(--fg-primary)] text-balance md:sr-only"
    >
      {children}
    </h1>
  )
}

/**
 * The one "side list + content" frame (DESIGN.md §9.13), as on Settings
 * and Help: the Workspace side list and the content starting on one line.
 * At 1100–1299px the list is a column; at 800–1099px one scrolling row of
 * pills above the content; from 1300px the app sidebar lists the sections
 * itself, and on phones the pill's Workspace menu does, so the page hides
 * its own in both (records.css). The page's h1 is the section's name
 * (`WorkspaceTitle`): drawn on phones, for screen readers only from 800px,
 * where the current item in the list names the page. The Overview's h1 is
 * the account name heading its ID box.
 *
 * Each section keeps its own `<section aria-labelledby>` in `children`,
 * pointing at `titleId`; its actions sit in its tab row.
 */
export function WorkspaceFrame({
  titleId,
  offset = true,
  children,
}: {
  /** The id of the section's h1, for its `<section aria-labelledby>`. */
  titleId?: string
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
      {current !== "overview" ? <WorkspaceTitle id={titleId}>{workspaceSectionLabel(current)}</WorkspaceTitle> : null}
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
