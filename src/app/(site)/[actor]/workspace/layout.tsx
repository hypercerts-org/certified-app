import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { WorkspaceNav, WorkspaceNavView } from "@/components/workspace-nav";

async function Nav({ params }: { params: Promise<{ actor: string }> }) {
  return <WorkspaceNav overview={workspaceHref(decodeURIComponent((await params).actor))} />;
}

/** A workspace: its sections in a side list, beside the open one. */
export default function WorkspaceLayout({ children, params }: LayoutProps<"/[actor]/workspace">) {
  return (
    <div className="workspace-layout">
      <Suspense fallback={<WorkspaceNavView overview="/workspace" />}>
        <Nav params={params} />
      </Suspense>
      <div className="workspace-content">{children}</div>
    </div>
  );
}
