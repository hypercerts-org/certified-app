import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsTile, ProjectsTileSkeleton } from "@/components/tiles";
import { profileActor, profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({ params }: PageProps<"/[actor]/projects">): Promise<Metadata> {
  return profileTabMetadata(params, "Projects");
}

async function Content({ params }: Pick<PageProps<"/[actor]/projects">, "params">) {
  const { actor } = await profileActor(params);
  return <ProjectsTile did={actor.did} />;
}

/** An account's projects, newest first. */
export default function ProjectsPage(props: PageProps<"/[actor]/projects">) {
  return (
    <Suspense fallback={<ProjectsTileSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
