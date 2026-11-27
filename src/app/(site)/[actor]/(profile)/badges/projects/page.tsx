import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/projects">): Promise<Metadata> {
  return profileTabMetadata(params, "Badges for projects");
}

/** The badges the account's projects received, each with its project. */
export default function ProjectBadgesPage(props: PageProps<"/[actor]/badges/projects">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="projects" />}>
      <ProfileBadges params={props.params} which="projects" />
    </Suspense>
  );
}
