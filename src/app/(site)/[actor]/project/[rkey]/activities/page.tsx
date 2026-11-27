import { connection } from "next/server";
import { Suspense } from "react";
import { ActivityList } from "@/components/activity-list";
import { ActivityPostsSkeleton } from "@/components/cards";
import { projectFrom } from "@/components/project-page";
import { listProjectActivitiesPage } from "@/lib/hypercerts/queries";

async function Activities({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]/activities">, "params">) {
  await connection(); // per visit: not in the cached page
  const { project, uri } = await projectFrom(params);
  const page = await listProjectActivitiesPage({ project: uri });
  return (
    <ActivityList initial={page} source={{ kind: "project", uri }} ownerDid={project.authorDid} />
  );
}

/** A project's activities, newest first, as posts: a tab of its own. */
export default function ProjectActivitiesPage(
  props: PageProps<"/[actor]/project/[rkey]/activities">,
) {
  return (
    <Suspense fallback={<ActivityPostsSkeleton />}>
      <Activities params={props.params} />
    </Suspense>
  );
}
