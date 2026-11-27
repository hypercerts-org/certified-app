import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { UnclaimedBadgesPill } from "@/components/unclaimed-badges-pill";
import {
  isOwnWorkspace,
  WorkspaceAccess,
  WorkspaceContentSkeleton,
} from "@/components/workspace-access";
import { WorkspaceNav, WorkspaceNavView } from "@/components/workspace-nav";
import { groupSettingsHref } from "@/lib/routes";
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
  const overview = isDid(did) ? workspaceHref(did) : "/workspace";
  const isGroup = isDid(did) && !(await isOwnWorkspace(did));
  return (
    <WorkspaceNav
      overview={overview}
      settingsHref={isGroup ? groupSettingsHref(did) : "/settings"}
      settingsLabel={isGroup ? "Group settings" : "Settings"}
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
 * A workspace: its sections in a side list, beside the open one. The layout
 * shows why a workspace can't be opened; each page and nested layout checks
 * access independently via `workspaceDid` (defense in depth).
 */
export default function WorkspaceLayout({ children, params }: LayoutProps<"/[actor]/workspace">) {
  return (
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
  );
}
