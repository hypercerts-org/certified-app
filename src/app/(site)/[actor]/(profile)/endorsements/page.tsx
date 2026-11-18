import { Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList } from "@/components/people-list";
import { ProfileTabs } from "@/components/profile-actions";
import { listEndorsements } from "@/lib/hypercerts/queries";
import { getActor } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/endorsements">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Endorsements` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/endorsements">, "params">) {
  const { actor, base } = await profileActor(params, "/endorsements");
  const page = await listEndorsements(actor.did, "received");
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
      <PeopleList page={page} empty="No endorsements received yet" />
    </div>
  );
}

/** Endorsements the account received (badge awards of type "endorsement"). */
export default function EndorsementsPage(props: PageProps<"/[actor]/endorsements">) {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Content params={props.params} />
    </Suspense>
  );
}
