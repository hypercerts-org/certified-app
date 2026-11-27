import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/issued">): Promise<Metadata> {
  return profileTabMetadata(params, "Badges issued");
}

/** The badges the account defined, and how many hold each. */
export default function IssuedBadgesPage(props: PageProps<"/[actor]/badges/issued">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="issued" />}>
      <ProfileBadges params={props.params} which="issued" />
    </Suspense>
  );
}
