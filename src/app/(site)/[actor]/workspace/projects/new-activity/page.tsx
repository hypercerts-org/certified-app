import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityForm } from "@/components/activity-form";
import { workspaceHref } from "@/components/cards";
import { PageHeader } from "@/components/page-title";
import { RecordFormSkeleton } from "@/components/record-form";
import { workspaceDid } from "@/components/workspace-access";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export const metadata: Metadata = { title: "New activity", robots: { index: false } };

// A new activity, published as the workspace's account (yours, or an
// organization's you belong to). Under Projects and activities, so that
// section stays marked in the workspace's side list.

async function NewActivity({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const actor = await getActor(did);
  return (
    <ActivityForm
      repo={did}
      self={actor?.handle ?? did}
      selfName={actor?.isOrganization ? nameOf(actor) : null}
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
