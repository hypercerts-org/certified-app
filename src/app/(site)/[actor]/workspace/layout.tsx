import { Skeleton } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { WorkspaceAccess } from "@/components/workspace-access";
import { EndorsementRowsSkeleton } from "@/components/workspace-endorsements";
import { WorkspaceNav, WorkspaceNavView } from "@/components/workspace-nav";

async function Nav({ params }: { params: Promise<{ actor: string }> }) {
  return <WorkspaceNav overview={workspaceHref(decodeURIComponent((await params).actor))} />;
}

/**
 * A workspace: its sections in a side list, beside the open one. Who may
 * open it is checked here, once, not by each page: the layout stays while
 * you move between its pages (workspace-access.tsx).
 */
export default function WorkspaceLayout({ children, params }: LayoutProps<"/[actor]/workspace">) {
  return (
    <div className="workspace-layout">
      <Suspense fallback={<WorkspaceNavView overview="/workspace" />}>
        <Nav params={params} />
      </Suspense>
      <div className="workspace-content">
        <Suspense
          fallback={
            <>
              <Skeleton variant="line" className="skeleton-heading" />
              <EndorsementRowsSkeleton />
            </>
          }
        >
          <WorkspaceAccess params={params}>{children}</WorkspaceAccess>
        </Suspense>
      </div>
    </div>
  );
}
