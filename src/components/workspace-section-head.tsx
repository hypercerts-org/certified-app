import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";

/**
 * A workspace section's head: its title, then its tab bar (`tabs`, usually
 * ProfileTabs streaming in its counts) on the section's hairline, with an
 * action at the bar's right end when the section has one (New badge,
 * Endorse someone). Every workspace section with tabs uses this, so the bar
 * and its line look the same in all of them.
 */
export function WorkspaceSectionHead({
  title,
  tabs,
  action,
}: {
  title: string;
  tabs: ReactNode;
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
