import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getActor, listEndorsements } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/endorsements/given">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Endorsements given` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/endorsements/given">, "params">) {
  const { actor, base } = await profileActor(params, "/endorsements/given");
  const page = await listEndorsements(actor.did, "given");
  return (
    <div className="profile-list-page">
      <ProfileTabs
        label="Endorsements"
        variant="segmented"
        tabs={[
          { label: "Received", href: `${base}/endorsements` },
          { label: "Given", href: `${base}/endorsements/given` },
        ]}
      />
      <PeopleList page={page} empty="No endorsements given yet" />
    </div>
  );
}

/** Endorsements the account gave. */
export default function EndorsementsGivenPage(props: PageProps<"/[actor]/endorsements/given">) {
  return (
    <Suspense
      fallback={
        <div className="profile-list-page">
          <SegmentedLinksSkeleton labels={["Received", "Given"]} current="Given" />
          <PeopleListSkeleton />
        </div>
      }
    >
      <Content params={props.params} />
    </Suspense>
  );
}
