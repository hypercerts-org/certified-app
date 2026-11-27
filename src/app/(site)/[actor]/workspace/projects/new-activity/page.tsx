import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityForm } from "@/components/activity-form";
import { workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { RecordFormSkeleton } from "@/components/record-form";
import { workspaceDid } from "@/components/workspace-access";
import { getActorCore, listSavedPlaces } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";

export const metadata: Metadata = { title: "New activity", robots: { index: false } };

// A new activity, published as the workspace's account (yours, or an
// organization's you belong to). Under Projects and activities, so that
// section stays marked in the workspace's side list.

async function NewActivity({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const [actor, handle, places] = await Promise.all([
    getActorCore(did),
    getHandle(did),
    listSavedPlaces(did),
  ]);
  return (
    <ActivityForm
      repo={did}
      self={handle ?? did}
      selfName={actor?.isOrganization ? nameOf({ ...actor, handle }) : null}
      places={places}
      cancelHref={`${workspaceHref(did)}/projects`}
    />
  );
}

export default function NewActivityPage({
  params,
}: PageProps<"/[actor]/workspace/projects/new-activity">) {
  return (
    <>
      <PageHeader
        title="New activity"
        description="Work you did, published for anyone to see and build on."
      />
      <Suspense fallback={<RecordFormSkeleton />}>
        <NewActivity params={params} />
      </Suspense>
    </>
  );
}
