import { Avatar, Eyebrow, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityList } from "@/components/activity-list";
import { actorHref, WorkCardsSkeleton } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import { Tile, TileSkeleton } from "@/components/tile";
import { TileSlot } from "@/components/tile-slot";
import { getActor, getProject, listProjectActivitiesPage } from "@/lib/hypercerts/queries";

export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey", rkey: "3msind56wn22t" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/project/[rkey]">): Promise<Metadata> {
  const { actor: actorParam, rkey } = await params;
  const actor = await getActor(decodeURIComponent(actorParam));
  const project =
    actor && (await getProject(`at://${actor.did}/org.hypercerts.collection/${rkey}`));
  return { title: project ? project.title : "Not found" };
}

async function ProjectActivities({ uri }: { uri: string }) {
  const page = await listProjectActivitiesPage({ project: uri });
  return (
    <Tile title="Activities in this project">
      <ActivityList initial={page} source={{ kind: "project", uri }} />
    </Tile>
  );
}

async function Project({ params }: Pick<PageProps<"/[actor]/project/[rkey]">, "params">) {
  const { actor: actorParam, rkey } = await params;
  // The route accepts a handle or DID; the collection URI needs the DID.
  const actor = await getActor(decodeURIComponent(actorParam));
  if (!actor) notFound();
  const uri = `at://${actor.did}/org.hypercerts.collection/${rkey}`;
  const project = await getProject(uri);
  if (!project) notFound();

  return (
    <>
      <div className="stack">
        <Eyebrow>Project</Eyebrow>
        <PageTitle>{project.title}</PageTitle>
        <Link prefetch href={actorHref(actor)} className="meta-author">
          <Avatar name={actor.displayName} src={actor.avatarUrl} size="sm" />
          <Text as="span" size="body-sm">
            {actor.displayName}
          </Text>
        </Link>
        {project.description && (
          <Text relaxed className="prewrap">
            {project.description}
          </Text>
        )}
      </div>
      <TileSlot title="Activities in this project" skeleton={<WorkCardsSkeleton count={4} />}>
        <ProjectActivities uri={uri} />
      </TileSlot>
    </>
  );
}

/** The project on its way: its title, author and description, then its activities. */
function ProjectSkeleton() {
  return (
    <>
      <div className="stack" aria-hidden>
        <Eyebrow>Project</Eyebrow>
        <Skeleton variant="line" className="skeleton-name" />
        <Skeleton variant="line" className="skeleton-meta" />
        <Skeleton variant="text" lines={2} className="skeleton-lead" />
      </div>
      <TileSkeleton title="Activities in this project">
        <WorkCardsSkeleton count={4} />
      </TileSkeleton>
    </>
  );
}

export default function ProjectPage(props: PageProps<"/[actor]/project/[rkey]">) {
  return (
    <div className="page">
      <Suspense fallback={<ProjectSkeleton />}>
        <Project params={props.params} />
      </Suspense>
    </div>
  );
}
