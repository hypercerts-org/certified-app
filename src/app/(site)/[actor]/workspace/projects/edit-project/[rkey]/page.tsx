import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { projectHref, workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { type ActivityChoice, ProjectForm } from "@/components/project-form";
import { RecordEditor } from "@/components/record-editor";
import { RecordFormSkeleton } from "@/components/record-form";
import { workspaceDid } from "@/components/workspace-access";
import { getWork, listSavedPlaces } from "@/lib/hypercerts/queries";
import { projectForEditing } from "@/lib/hypercerts/record-drafts";
import { isRkey } from "@/lib/validate";

export const metadata: Metadata = { title: "Edit project", robots: { index: false } };

// One of the workspace's projects, edited in the form New project uses.
// Reached from the project's page (its menu). Under Projects and activities,
// so that section stays marked in the workspace's side list.

async function EditProject({ params }: { params: Promise<{ actor: string; rkey: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const { rkey } = await params;
  if (!isRkey(rkey)) notFound();
  return (
    <RecordEditor
      did={did}
      here={`${workspaceHref(did)}/projects/edit-project/${rkey}`}
      what="project"
    >
      {async (repository) => {
        const [editing, work, places] = await Promise.all([
          projectForEditing(repository, rkey),
          getWork(did),
          listSavedPlaces(did),
        ]);
        if (!editing) notFound();
        const activities: ActivityChoice[] = work.activities.map((activity) => ({
          uri: activity.uri,
          title: activity.title,
          meta: activity.period ?? (activity.createdAt ? `Created ${activity.createdAt}` : ""),
        }));
        return (
          <ProjectForm
            repo={did}
            activities={activities}
            places={places}
            cancelHref={projectHref({ authorDid: did, rkey })}
            editing={editing}
          />
        );
      }}
    </RecordEditor>
  );
}

export default function EditProjectPage({
  params,
}: PageProps<"/[actor]/workspace/projects/edit-project/[rkey]">) {
  return (
    <>
      <PageHeader title="Edit project" description="Change what the published project says." />
      <Suspense fallback={<RecordFormSkeleton />}>
        <EditProject params={params} />
      </Suspense>
    </>
  );
}
