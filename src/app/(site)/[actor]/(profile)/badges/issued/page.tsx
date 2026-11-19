import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { getActor } from "@/lib/hypercerts/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/issued">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Badges issued` : "Not found" };
}

/** The badges the account defined, and how many hold each. */
export default function IssuedBadgesPage(props: PageProps<"/[actor]/badges/issued">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="issued" />}>
      <ProfileBadges params={props.params} which="issued" />
    </Suspense>
  );
}
