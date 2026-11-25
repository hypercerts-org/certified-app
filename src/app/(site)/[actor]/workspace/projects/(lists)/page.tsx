import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkListSkeleton, WorkProjects } from "@/components/work-lists";
import { workspaceDid } from "@/components/workspace-access";
import { getWork } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Projects", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const work = await getWork(did);
  return (
    <WorkProjects
      projects={work.projects}
      note={work.truncated ? "Showing the first 500 projects and activities." : null}
    />
  );
}

/** The workspace's projects, newest first. */
export default function Page({ params }: PageProps<"/[actor]/workspace/projects">) {
  return (
    <Suspense fallback={<WorkListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
