import { Skeleton } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { UnclaimedBadgesPill } from "@/components/unclaimed-badges-pill";
import { WorkspaceAccess } from "@/components/workspace-access";
import { WorkspaceNav, WorkspaceNavView } from "@/components/workspace-nav";
import { isDid } from "@/lib/validate";

async function Nav({ params }: { params: Promise<{ actor: string }> }) {
  let did = "";
  try {
    did = decodeURIComponent((await params).actor);
  } catch {
    return <WorkspaceNavView overview="/workspace" />;
  }
  const overview = isDid(did) ? workspaceHref(did) : "/workspace";
  return (
    <WorkspaceNav
      overview={overview}
      badgesBadge={
        isDid(did) ? (
          <Suspense fallback={null}>
            <UnclaimedBadgesPill did={did} />
          </Suspense>
        ) : null
      }
    />
  );
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
            <div className="stack" aria-hidden>
              <Skeleton variant="line" className="skeleton-heading" />
              <Skeleton variant="text" lines={3} />
            </div>
          }
        >
          <WorkspaceAccess params={params}>{children}</WorkspaceAccess>
        </Suspense>
      </div>
    </div>
  );
}
