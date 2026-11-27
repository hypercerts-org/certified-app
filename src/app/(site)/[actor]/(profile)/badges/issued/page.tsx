import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/issued">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Badges issued` : "Not found" };
}

/** The badges the account defined, and how many hold each. */
export default function IssuedBadgesPage(props: PageProps<"/[actor]/badges/issued">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="issued" />}>
      <ProfileBadges params={props.params} which="issued" />
    </Suspense>
  );
}
