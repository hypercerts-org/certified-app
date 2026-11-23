import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badges">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Badges` : "Not found" };
}

/** The badges the account accepted. */
export default function BadgesPage(props: PageProps<"/[actor]/badges">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="accepted" />}>
      <ProfileBadges params={props.params} which="accepted" />
    </Suspense>
  );
}
