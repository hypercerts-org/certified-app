import { connection } from "next/server";
import { Suspense } from "react";
import { activityFrom } from "@/components/activity-page";
import { BadgeListSkeleton, RecordBadgeList } from "@/components/badges";

async function ActivityBadges({
  params,
}: Pick<PageProps<"/[actor]/activity/[rkey]/badges">, "params">) {
  await connection(); // per visit: not in the cached page
  const { uri } = await activityFrom(params);
  return <RecordBadgeList uri={uri} />;
}

/** The badges the activity received. */
export default function Page(props: PageProps<"/[actor]/activity/[rkey]/badges">) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <ActivityBadges params={props.params} />
    </Suspense>
  );
}
