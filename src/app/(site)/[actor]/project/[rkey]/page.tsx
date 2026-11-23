import { Suspense } from "react";
import { ActivityList } from "@/components/activity-list";
import { ActivityPostsSkeleton } from "@/components/cards";
import { projectFrom } from "@/components/project-page";
import { listProjectActivitiesPage } from "@/lib/hypercerts/queries";

async function Activities({ params }: Pick<PageProps<"/[actor]/project/[rkey]">, "params">) {
  const { actor, uri } = await projectFrom(params);
  const page = await listProjectActivitiesPage({ project: uri });
  return <ActivityList initial={page} source={{ kind: "project", uri }} ownerDid={actor.did} />;
}

/** A project's activities, newest first, as posts: its default tab. */
export default function ProjectActivitiesPage(props: PageProps<"/[actor]/project/[rkey]">) {
  return (
    <Suspense fallback={<ActivityPostsSkeleton />}>
      <Activities params={props.params} />
    </Suspense>
  );
}
