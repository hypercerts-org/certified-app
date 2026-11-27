import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { OverviewSkeleton } from "@/components/workspace-overview";
import { getActingAs } from "@/lib/acting-as";
import { signInHref } from "@/lib/validate";

export const ensureStatic = "shell";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

async function ToWorkspace(): Promise<never> {
  const actingAs = await getActingAs();
  redirect(actingAs ? workspaceHref(actingAs) : signInHref("/workspace"));
}

/** `/workspace` opens the workspace of whoever you act as. */
export default function WorkspacePage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <ToWorkspace />
    </Suspense>
  );
}
