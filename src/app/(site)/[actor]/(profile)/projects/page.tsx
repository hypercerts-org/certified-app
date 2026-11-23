import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsTile, ProjectsTileSkeleton } from "@/components/tiles";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/projects">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Projects` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/projects">, "params">) {
  const { actor } = await profileActor(params, "/projects");
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
