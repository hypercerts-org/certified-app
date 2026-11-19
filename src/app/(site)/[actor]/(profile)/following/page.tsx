import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getActor, listFollows } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/following">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Following` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/following">, "params">) {
  const { actor, base } = await profileActor(params, "/following");
  const page = await listFollows(actor.did, "following");
  return (
    <div className="profile-list-page">
      <ProfileTabs
        label="Follows"
        variant="segmented"
        tabs={[
          { label: "Followers", href: `${base}/followers` },
          { label: "Following", href: `${base}/following` },
        ]}
      />
      <PeopleList page={page} empty="Not following anyone yet" />
    </div>
  );
}

/** Whom the account follows. */
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
