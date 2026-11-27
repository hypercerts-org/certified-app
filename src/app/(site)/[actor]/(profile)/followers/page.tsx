import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getActor, getFollowCounts, listFollows } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/followers">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Followers` : "Not found" };
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
