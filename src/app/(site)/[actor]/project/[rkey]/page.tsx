import { Avatar, Eyebrow, ExpandableText, Skeleton, Text } from "@hypercerts-org/ui-react";
import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityList } from "@/components/activity-list";
import { actorHref, WorkCardsSkeleton } from "@/components/cards";
import { ComingSoonButton } from "@/components/coming-soon";
import { PageTitle } from "@/components/page-title";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { Tile, TileSkeleton } from "@/components/tile";
import { TileSlot } from "@/components/tile-slot";
import {
  getActor,
  getProject,
  getProjectFollowers,
  listProjectActivitiesPage,
} from "@/lib/hypercerts/queries";

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

const numberFormat = new Intl.NumberFormat("en");

/** "158 followers", beside the author: how many follow the project. */
async function FollowerCount({ uri }: { uri: string }) {
  const { total } = await getProjectFollowers(uri);
  if (total === 0) return null;
  return (
    <Text as="span" size="body-sm" tone="muted">
      {numberFormat.format(total)} {total === 1 ? "follower" : "followers"}
    </Text>
  );
}

/** The accounts that follow the project, newest first. */
async function ProjectFollowers({ uri }: { uri: string }) {
  const page = await getProjectFollowers(uri);
  return (
    <Tile title="Followers">
      {/* Its own "more" line, below, gives the total. */}
      <PeopleList page={{ ...page, more: false }} empty="No one follows this project yet." />
      {page.more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {page.rows.length} of {numberFormat.format(page.total)}.
        </Text>
      )}
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
      <div className="project-head">
        <div className="stack">
          <Eyebrow>Project</Eyebrow>
          <PageTitle>{project.title}</PageTitle>
          <div className="project-meta">
            <Link prefetch href={actorHref(actor)} className="meta-author">
              <Avatar name={actor.displayName} src={actor.avatarUrl} size="sm" />
              <Text as="span" size="body-sm">
                {actor.displayName}
              </Text>
            </Link>
            <Suspense fallback={null}>
              <FollowerCount uri={uri} />
            </Suspense>
          </div>
          {project.description && (
            // Long descriptions fade out above Read more, as on profiles.
            <ExpandableText lines={6} className="expandable-fade">
              <Text relaxed className="prewrap">
                {project.description}
              </Text>
            </ExpandableText>
          )}
        </div>
        {/* Following a project comes with the Hypercerts SDK's writes. */}
        <ComingSoonButton>
          <UserPlus size={16} aria-hidden />
          Follow
        </ComingSoonButton>
      </div>
      <TileSlot title="Activities in this project" skeleton={<WorkCardsSkeleton count={4} />}>
        <ProjectActivities uri={uri} />
      </TileSlot>
      <TileSlot title="Followers" skeleton={<PeopleListSkeleton rows={4} />}>
        <ProjectFollowers uri={uri} />
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
      <TileSkeleton title="Followers">
        <PeopleListSkeleton rows={4} />
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
