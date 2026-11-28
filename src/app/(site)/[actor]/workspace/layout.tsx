import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { UnclaimedBadgesPill } from "@/components/unclaimed-badges-pill";
import { WorkspaceAccess, WorkspaceContentSkeleton } from "@/components/workspace-access";
import { WorkspaceNav, WorkspaceNavProvider, WorkspaceNavView } from "@/components/workspace-nav";
import { isDid } from "@/lib/validate";

// Keep the App Shell static so default links never trigger runtime server
// renders; signed-in sidebar/nav links with `prefetch` still prefetch per user.
export const ensureStatic = "shell";

async function Nav({ params }: { params: Promise<{ actor: string }> }) {
  const raw = (await params).actor;
  let did = "";
  try {
    did = decodeURIComponent(raw);
  } catch {
    return <WorkspaceNavView overview="/workspace" />;
  }
  if (!isDid(did)) return <WorkspaceNav overview="/workspace" />;
  return (
    <WorkspaceNav
      overview={workspaceHref(did)}
      badgesBadge={
        <Suspense fallback={null}>
          <UnclaimedBadgesPill did={did} />
        </Suspense>
      }
    />
  );
}

/**
 * A workspace: the open section, with its sections in the app sidebar from
 * 64rem and, narrower, in a sheet its title opens. The layout shows why a
 * workspace can't be opened; each page and nested layout checks access
 * independently via `workspaceDid` (defense in depth).
 */
export default function WorkspaceLayout({ children, params }: LayoutProps<"/[actor]/workspace">) {
  return (
    <WorkspaceNavProvider>
      <div className="workspace-layout">
        <Suspense fallback={<WorkspaceNavView overview="/workspace" />}>
          <Nav params={params} />
        </Suspense>
        <div className="workspace-content">
          <Suspense fallback={<WorkspaceContentSkeleton />}>
            <WorkspaceAccess params={params}>{children}</WorkspaceAccess>
          </Suspense>
        </div>
      </div>
    </WorkspaceNavProvider>
  );
}
