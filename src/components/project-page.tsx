// A project's page, like a profile: its banner, its header (what it is, by
// whom, how many follow it, Follow), then its pages as tabs, each its own
// URL: Activities (the default), Funding and Followers.

import { ExpandableText, Eyebrow, Skeleton, Text } from "@hypercerts-org/ui-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActorAvatar, ActorName } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import { FollowControl, ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { getActingAs } from "@/lib/acting-as";
import {
  getActor,
  getEntityFollow,
  getProject,
  getProjectFollowers,
} from "@/lib/hypercerts/queries";

export type ProjectParams = Promise<{ actor: string; rkey: string }>;

/** A record key as AT Protocol allows it; anything else is no project. */
const RKEY = /^[A-Za-z0-9._:~-]{1,512}$/;

const numberFormat = new Intl.NumberFormat("en");

/** The project these params name, its author, and its pages' base address; else a 404. */
export async function projectFrom(params: ProjectParams) {
  const { actor: id, rkey } = await params;
  if (!RKEY.test(rkey)) notFound();
  // The route accepts a handle or DID; the collection URI needs the DID.
  const actor = await getActor(decodeURIComponent(id));
  if (!actor) notFound();
  const uri = `at://${actor.did}/org.hypercerts.collection/${rkey}`;
  const project = await getProject(uri);
  if (!project) notFound();
  return { actor, project, uri, base: `/${decodeURIComponent(id)}/project/${rkey}` };
}

/** "158 followers", beside the author. */
async function FollowerCount({ uri }: { uri: string }) {
  const { total } = await getProjectFollowers(uri);
  if (total === 0) return null;
  return (
    <Text as="span" size="body-sm" tone="muted">
      {numberFormat.format(total)} {total === 1 ? "follower" : "followers"}
    </Text>
  );
}

/** Follow, for anyone but the project's author (as whom it acts, it has nothing to follow). */
async function ProjectFollow({ uri, author, path }: { uri: string; author: string; path: string }) {
  const actingAs = await getActingAs();
  if (actingAs === author) return null;
  return (
    <FollowControl
      subject={uri}
      path={path}
      actor={actingAs}
      follow={actingAs ? await getEntityFollow(actingAs, uri) : null}
    />
  );
}

const TABS = [
  { label: "Activities", path: "" },
  { label: "Funding", path: "/funding" },
  { label: "Followers", path: "/followers" },
] as const;

/** The tabs carry no numbers: the header already says how many follow. */
function tabs(base: string) {
  return TABS.map((tab) => ({ label: tab.label, href: `${base}${tab.path}` }));
}

export async function ProjectHeader({ params }: { params: ProjectParams }) {
  const { actor, project, uri, base } = await projectFrom(params);
  return (
    <>
      {project.bannerUrl && (
        <div className="profile-banner">
          {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
          <img src={project.bannerUrl} alt="" />
        </div>
      )}
      <div className="project-head">
        <div className="stack">
          <Eyebrow>Project</Eyebrow>
          <PageTitle>
            <span dir="auto">{project.title}</span>
          </PageTitle>
          <div className="project-meta">
            <Link prefetch href={actorHref(actor)} className="meta-author">
              <ActorAvatar actor={actor} size="sm" />
              <Text as="span" size="body-sm">
                <ActorName actor={actor} />
              </Text>
            </Link>
            <Suspense fallback={null}>
              <FollowerCount uri={uri} />
            </Suspense>
          </div>
          {project.description && (
            // Long descriptions fade out above Read more, as on profiles.
            <ExpandableText lines={4} className="expandable-fade measure">
              <Text relaxed className="prewrap" dir="auto">
                {project.description}
              </Text>
            </ExpandableText>
          )}
        </div>
        <Suspense fallback={null}>
          <ProjectFollow uri={uri} author={actor.did} path={base} />
        </Suspense>
      </div>
      <ProfileTabs label="Project" tabs={tabs(base)} />
    </>
  );
}

/** The header on its way: what it is, by whom, then the tabs. */
export function ProjectHeaderSkeleton() {
  return (
    <>
      <div className="stack" aria-hidden>
        <Eyebrow>Project</Eyebrow>
        <Skeleton variant="line" className="skeleton-name" />
        <Skeleton variant="line" className="skeleton-meta" />
        <Skeleton variant="text" lines={3} className="skeleton-lead" />
      </div>
      <ProfileTabsSkeleton labels={TABS.map((tab) => tab.label)} />
    </>
  );
}
