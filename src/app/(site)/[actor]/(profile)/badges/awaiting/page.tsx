import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/awaiting">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Badges awaiting response` : "Not found" };
}

/** Badges awarded to the account that it hasn't answered yet. */
export default function AwaitingBadgesPage(props: PageProps<"/[actor]/badges/awaiting">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="awaiting" />}>
      <ProfileBadges params={props.params} which="awaiting" />
    </Suspense>
  );
}
