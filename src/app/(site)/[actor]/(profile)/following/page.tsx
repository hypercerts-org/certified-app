import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { FollowingLists } from "@/components/follow-lists";
import { PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import {
  getActor,
  getFollowCounts,
  listFollows,
  listProjectsFollowed,
} from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/following">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Following` : "Not found" };
}

const numberFormat = new Intl.NumberFormat("en");
/** A sub-tab's count, as the Badges tabs show theirs; none when there are none. */
const tabCount = (n: number) => (n > 0 ? numberFormat.format(n) : undefined);

async function Content({ params }: Pick<PageProps<"/[actor]/following">, "params">) {
  const { actor, base } = await profileActor(params);
  const [page, projects, counts] = await Promise.all([
    listFollows(actor.did, "following"),
    listProjectsFollowed(actor.did),
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
      {/* Accounts, then projects: two lists, one beneath the other. */}
      <FollowingLists accounts={page} projects={projects} path={`${base}/following`} />
    </div>
  );
}

/** Whom the account follows: accounts, then projects. */
export default function FollowingPage(props: PageProps<"/[actor]/following">) {
  return (
    <Suspense
      fallback={
        <div className="profile-list-page">
          <SegmentedLinksSkeleton labels={["Followers", "Following"]} current="Following" />
          <PeopleListSkeleton />
        </div>
      }
    >
      <Content params={props.params} />
    </Suspense>
  );
}
