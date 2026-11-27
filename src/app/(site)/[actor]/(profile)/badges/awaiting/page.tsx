import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/awaiting">): Promise<Metadata> {
  return profileTabMetadata(params, "Badges awaiting response");
}

/** Badges awarded to the account that it hasn't answered yet. */
export default function AwaitingBadgesPage(props: PageProps<"/[actor]/badges/awaiting">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="awaiting" />}>
      <ProfileBadges params={props.params} which="awaiting" />
    </Suspense>
  );
}
