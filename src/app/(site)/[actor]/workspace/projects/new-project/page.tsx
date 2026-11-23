import type { Metadata } from "next";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { type ActivityChoice, ProjectForm } from "@/components/project-form";
import { RecordFormSkeleton } from "@/components/record-form";
import { workspaceDid } from "@/components/workspace-access";
import { getWork } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "New project", robots: { index: false } };

// A new project, published as the workspace's account (yours, or an
// organization's you belong to), holding activities of that account. Under
// Projects and activities, so that section stays marked in the side list.

async function NewProject({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const work = await getWork(did);
  const activities: ActivityChoice[] = work.activities.map((activity) => ({
    uri: activity.uri,
    title: activity.title,
    meta: activity.period ?? (activity.createdAt ? `Created ${activity.createdAt}` : ""),
  }));
  return (
    <ProjectForm repo={did} activities={activities} cancelHref={`${workspaceHref(did)}/projects`} />
  );
}

export default function NewProjectPage({
  params,
}: PageProps<"/[actor]/workspace/projects/new-project">) {
  return (
    <>
      <PageHeader
        title="New project"
        description="Group related activities under one project, like a folder."
      />
      <Suspense fallback={<RecordFormSkeleton />}>
        <NewProject params={params} />
      </Suspense>
    </>
  );
}
