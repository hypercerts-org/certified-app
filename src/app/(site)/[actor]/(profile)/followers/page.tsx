import { Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList } from "@/components/people-list";
import { ProfileTabs } from "@/components/profile-actions";
import { listFollows } from "@/lib/hypercerts/queries";
import { getActor } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/followers">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Followers` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/followers">, "params">) {
  const { actor, base } = await profileActor(params, "/followers");
  const page = await listFollows(actor.did, "followers");
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
      <PeopleList page={page} empty="No followers yet" />
    </div>
  );
}

/** Who follows the account. */
export default function FollowersPage(props: PageProps<"/[actor]/followers">) {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Content params={props.params} />
    </Suspense>
  );
}
