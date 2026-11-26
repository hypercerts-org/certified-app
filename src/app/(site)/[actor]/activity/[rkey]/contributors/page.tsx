import { Users } from "lucide-react";
import { Suspense } from "react";
import { activityFrom, Contributors } from "@/components/activity-page";
import { Empty } from "@/components/empty";
import { PeopleListSkeleton } from "@/components/people-list";
import { getActivity } from "@/lib/hypercerts/queries";

async function ActivityContributors({
  params,
}: Pick<PageProps<"/[actor]/activity/[rkey]/contributors">, "params">) {
  // With their verified handles, for the links to them.
  const { uri } = await activityFrom(params);
  const activity = await getActivity(uri);
  if (!activity) return null;
  // The tab shows only with contributors; an old link can still land here.
  if (activity.contributors.length === 0) return <Empty icon={Users} title="No contributors yet" />;
  return <Contributors contributors={activity.contributors} />;
}

/** Who did the work, with their roles and shares. */
export default function Page(props: PageProps<"/[actor]/activity/[rkey]/contributors">) {
  return (
    <Suspense fallback={<PeopleListSkeleton />}>
      <ActivityContributors params={props.params} />
    </Suspense>
  );
}
