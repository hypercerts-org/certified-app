import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";

/**
 * A workspace section's head: its title, then its tab bar (`tabs`, usually
 * ProfileTabs streaming in its counts) on the section's hairline, with its
 * main action at the bar's right end when the section has one (Create badge,
 * Endorse someone; see SECTION_ACTION). Every workspace section uses this,
 * so the bar, its line and the action sit the same in all of them; one
 * without tabs (Lists) keeps the line and the action.
 */
export function WorkspaceSectionHead({
  title,
  tabs,
  action,
}: {
  title: string;
  tabs?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <>
      <PageTitle className="workspace-title">{title}</PageTitle>
      <div className="workspace-tabbar">
        {tabs}
        {action && <div className="workspace-tabbar-action">{action}</div>}
      </div>
    </>
  );
}
