import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkActivities, type WorkActivity, WorkListSkeleton } from "@/components/work-lists";
import { workspaceDid } from "@/components/workspace-access";
import { getWork } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Activities", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const work = await getWork(did);
  // Each activity with the projects it is in.
  const projectsOf = new Map<string, string[]>();
  for (const project of work.projects) {
    for (const uri of project.activityUris) {
      projectsOf.set(uri, [...(projectsOf.get(uri) ?? []), project.title]);
    }
  }
  const activities: WorkActivity[] = work.activities.map((activity) => ({
    activity,
    projects: projectsOf.get(activity.uri) ?? [],
  }));
  return (
    <WorkActivities
      activities={activities}
      note={work.truncated ? "Showing the first 500 projects and activities." : null}
    />
  );
}

/** The workspace's activities, newest first, with the projects they are in. */
export default function Page({ params }: PageProps<"/[actor]/workspace/projects/activities">) {
  return (
    <Suspense fallback={<WorkListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
