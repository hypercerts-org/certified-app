import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivitiesTile, ActivitiesTileSkeleton } from "@/components/tiles";
import { profileActor, profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({ params }: PageProps<"/[actor]/activities">): Promise<Metadata> {
  return profileTabMetadata(params, "Activities");
}

async function Content({ params }: Pick<PageProps<"/[actor]/activities">, "params">) {
  const { actor } = await profileActor(params);
  return <ActivitiesTile did={actor.did} />;
}

/** All of an account's activities, newest first, with "load more". */
export default function ActivitiesPage(props: PageProps<"/[actor]/activities">) {
  return (
    <Suspense fallback={<ActivitiesTileSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
