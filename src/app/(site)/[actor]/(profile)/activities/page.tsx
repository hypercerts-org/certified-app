import { Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivitiesTile } from "@/components/tiles";
import { getActor } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/activities">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Activities` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/activities">, "params">) {
  const { actor } = await profileActor(params, "/activities");
  return <ActivitiesTile did={actor.did} />;
}

/** All of an account's activities, newest first, with "load more". */
export default function ActivitiesPage(props: PageProps<"/[actor]/activities">) {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Content params={props.params} />
    </Suspense>
  );
}
