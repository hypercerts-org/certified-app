import { Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsTile } from "@/components/tiles";
import { getActor } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/projects">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Projects` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/projects">, "params">) {
  const { actor } = await profileActor(params, "/projects");
  return <ProjectsTile did={actor.did} />;
}

/** An account's projects, newest first. */
export default function ProjectsPage(props: PageProps<"/[actor]/projects">) {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Content params={props.params} />
    </Suspense>
  );
}
