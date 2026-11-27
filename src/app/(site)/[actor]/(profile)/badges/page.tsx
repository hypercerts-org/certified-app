import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({ params }: PageProps<"/[actor]/badges">): Promise<Metadata> {
  return profileTabMetadata(params, "Badges");
}

/** The badges the account accepted. */
export default function BadgesPage(props: PageProps<"/[actor]/badges">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="accepted" />}>
      <ProfileBadges params={props.params} which="accepted" />
    </Suspense>
  );
}
