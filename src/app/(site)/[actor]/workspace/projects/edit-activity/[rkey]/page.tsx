import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityForm } from "@/components/activity-form";
import { activityHref, workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { RecordEditor } from "@/components/record-editor";
import { RecordFormSkeleton } from "@/components/record-form";
import { workspaceDid } from "@/components/workspace-access";
import { getActor, listSavedPlaces } from "@/lib/hypercerts/queries";
import { activityForEditing } from "@/lib/hypercerts/record-drafts";
import { nameOf } from "@/lib/hypercerts/views";
import { isRkey } from "@/lib/validate";

export const metadata: Metadata = { title: "Edit activity", robots: { index: false } };

// One of the workspace's activities, edited in the form New activity uses.
// Reached from the activity's page (its menu). Under Projects and
// activities, so that section stays marked in the workspace's side list.

async function EditActivity({ params }: { params: Promise<{ actor: string; rkey: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const { rkey } = await params;
  if (!isRkey(rkey)) notFound();
  return (
    <RecordEditor
      did={did}
      here={`${workspaceHref(did)}/projects/edit-activity/${rkey}`}
      what="activity"
    >
      {async (repository) => {
        const [editing, actor, places] = await Promise.all([
          activityForEditing(repository, rkey),
          getActor(did),
          listSavedPlaces(did),
        ]);
        if (!editing) notFound();
        return (
          <ActivityForm
            repo={did}
            self={actor?.handle ?? did}
            selfName={actor?.isOrganization ? nameOf(actor) : null}
            places={places}
            cancelHref={activityHref(editing.uri)}
            editing={editing}
          />
        );
      }}
    </RecordEditor>
  );
}

export default function EditActivityPage({
  params,
}: PageProps<"/[actor]/workspace/projects/edit-activity/[rkey]">) {
  return (
    <>
      <PageHeader title="Edit activity" description="Change what the published activity says." />
      <Suspense fallback={<RecordFormSkeleton />}>
        <EditActivity params={params} />
      </Suspense>
    </>
  );
}
