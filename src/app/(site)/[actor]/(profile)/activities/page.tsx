import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ActivitiesTile, ActivitiesTileSkeleton } from "@/components/tiles";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/activities">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Activities` : "Not found" };
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
