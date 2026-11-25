import { Suspense } from "react";
import { activityFrom } from "@/components/activity-page";
import { Funding, FundingSkeleton } from "@/components/funding";

async function ActivityFunding({
  params,
}: Pick<PageProps<"/[actor]/activity/[rkey]/funding">, "params">) {
  const { uri } = await activityFrom(params);
  // "For" is this activity on every row.
  return <Funding filter={{ for: uri }} label="Received" omit="for" empty="No funding yet" />;
}

/** The funding recorded for the activity: its figures and receipts. */
export default function Page(props: PageProps<"/[actor]/activity/[rkey]/funding">) {
  return (
    <Suspense fallback={<FundingSkeleton />}>
      <ActivityFunding params={props.params} />
    </Suspense>
  );
}
