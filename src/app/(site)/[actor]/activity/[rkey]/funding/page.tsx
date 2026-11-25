import { Suspense } from "react";
import { activityFrom } from "@/components/activity-page";
import { Funding, FundingSkeleton } from "@/components/funding";

async function ActivityFunding({
  params,
}: Pick<PageProps<"/[actor]/activity/[rkey]/funding">, "params">) {
  const { uri } = await activityFrom(params);
  // Every row is for this activity, to its organization: neither is repeated.
  return (
    <Funding filter={{ for: uri }} label="Received" omit={["to", "for"]} empty="No funding yet" />
  );
}

/** The funding recorded for the activity: its figures and receipts. */
export default function Page(props: PageProps<"/[actor]/activity/[rkey]/funding">) {
  return (
    <Suspense fallback={<FundingSkeleton />}>
      <ActivityFunding params={props.params} />
    </Suspense>
  );
}
