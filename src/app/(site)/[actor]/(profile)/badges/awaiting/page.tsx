import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { getActor } from "@/lib/hypercerts/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/awaiting">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Badges awaiting response` : "Not found" };
}

/** Badges awarded to the account that it hasn't answered yet. */
export default function AwaitingBadgesPage(props: PageProps<"/[actor]/badges/awaiting">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="awaiting" />}>
      <ProfileBadges params={props.params} which="awaiting" />
    </Suspense>
  );
}
