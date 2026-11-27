import { ThumbsUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getEndorsements, listEndorsements } from "@/lib/hypercerts/queries";
import { profileActor, profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({
  params,
}: PageProps<"/[actor]/endorsements">): Promise<Metadata> {
  return profileTabMetadata(params, "Endorsements");
}

const numberFormat = new Intl.NumberFormat("en");
/** A sub-tab's count, as the Badges tabs show theirs; none when there are none. */
const tabCount = (n: number) => (n > 0 ? numberFormat.format(n) : undefined);

async function Content({ params }: Pick<PageProps<"/[actor]/endorsements">, "params">) {
  const { actor, base } = await profileActor(params);
  const [page, counts] = await Promise.all([
    listEndorsements(actor.did, "received"),
    getEndorsements(actor.did),
  ]);
  return (
    <div className="profile-list-page">
      <ProfileTabs
        label="Endorsements"
        variant="segmented"
        tabs={[
          {
            label: "Received",
            href: `${base}/endorsements`,
            count: tabCount(counts.receivedCount),
          },
          {
            label: "Given",
            href: `${base}/endorsements/given`,
            count: tabCount(counts.given),
          },
        ]}
      />
      <PeopleList page={page} empty="No endorsements received yet" icon={ThumbsUp} />
    </div>
  );
}

/** Endorsements the account received (badge awards of type "endorsement"). */
export default function EndorsementsPage(props: PageProps<"/[actor]/endorsements">) {
  return (
    <Suspense
      fallback={
        <div className="profile-list-page">
          <SegmentedLinksSkeleton labels={["Received", "Given"]} current="Received" />
          <PeopleListSkeleton />
        </div>
      }
    >
      <Content params={props.params} />
    </Suspense>
  );
}
