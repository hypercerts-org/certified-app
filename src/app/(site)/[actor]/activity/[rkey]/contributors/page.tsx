import { Users } from "lucide-react";
import { Suspense } from "react";
import { activityFrom, Contributors } from "@/components/activity-page";
import { Empty } from "@/components/empty";
import { PeopleListSkeleton } from "@/components/people-list";

async function ActivityContributors({
  params,
}: Pick<PageProps<"/[actor]/activity/[rkey]/contributors">, "params">) {
  const { activity } = await activityFrom(params);
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
