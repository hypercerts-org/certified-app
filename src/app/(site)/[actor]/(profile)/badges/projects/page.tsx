import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileBadges, ProfileBadgesSkeleton } from "@/components/badges";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badges/projects">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Badges for projects` : "Not found" };
}

/** The badges the account's projects received, each with its project. */
export default function ProjectBadgesPage(props: PageProps<"/[actor]/badges/projects">) {
  return (
    <Suspense fallback={<ProfileBadgesSkeleton which="projects" />}>
      <ProfileBadges params={props.params} which="projects" />
    </Suspense>
  );
}
