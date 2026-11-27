import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getFollowCounts, listFollows } from "@/lib/hypercerts/queries";
import { profileActor, profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({ params }: PageProps<"/[actor]/followers">): Promise<Metadata> {
  return profileTabMetadata(params, "Followers");
}

const numberFormat = new Intl.NumberFormat("en");
/** A sub-tab's count, as the Badges tabs show theirs; none when there are none. */
const tabCount = (n: number) => (n > 0 ? numberFormat.format(n) : undefined);

async function Content({ params }: Pick<PageProps<"/[actor]/followers">, "params">) {
  const { actor, base } = await profileActor(params);
  const [page, counts] = await Promise.all([
    listFollows(actor.did, "followers"),
    getFollowCounts(actor.did),
  ]);
  return (
    <div className="profile-list-page">
      <ProfileTabs
        label="Follows"
        variant="segmented"
        tabs={[
          {
            label: "Followers",
            href: `${base}/followers`,
            count: tabCount(counts.followers),
          },
          {
            label: "Following",
            href: `${base}/following`,
            count: tabCount(counts.following),
          },
        ]}
      />
      <PeopleList page={page} empty="No followers yet" />
    </div>
  );
}

/** Who follows the account. */
export default function FollowersPage(props: PageProps<"/[actor]/followers">) {
  return (
    <Suspense
      fallback={
        <div className="profile-list-page">
          <SegmentedLinksSkeleton labels={["Followers", "Following"]} current="Followers" />
          <PeopleListSkeleton />
        </div>
      }
    >
      <Content params={props.params} />
    </Suspense>
  );
}
