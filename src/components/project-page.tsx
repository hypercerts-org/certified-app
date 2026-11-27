// A project's page, laid out like a profile: its banner and header (what it
// is, by whom, how many follow it, Follow), then two columns. On the left its
// pages as tabs, each its own URL: Overview (the default, a timeline of what
// happened in it), Activities, Followers, Badges, Funding. On the right what
// stays put: its figures, where it is, and its identifiers.

import { ExpandableText, Eyebrow, Skeleton, Text } from "@hypercerts-org/ui-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlsoOn } from "@/components/also-on";
import { AuthorLink } from "@/components/author-link";
import { LocationCard } from "@/components/location-card";
import { PageTitle } from "@/components/page-title";
import { FollowControl, ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { RecordActions } from "@/components/record-actions";
import { RecordFacts, RecordFigures } from "@/components/record-rail";
import { RichText } from "@/components/rich-text";
import { TileSlot } from "@/components/tile-slot";
import { getActingAs } from "@/lib/acting-as";
import {
  didOfSegment,
  getEntityFollow,
  getPlace,
  getProjectFollowers,
  getProjectRecord,
} from "@/lib/hypercerts/queries";
import { leadOf } from "@/lib/rich-text";

export type ProjectParams = Promise<{ actor: string; rkey: string }>;

/** A record key as AT Protocol allows it; anything else is no project. */
const RKEY = /^[A-Za-z0-9._:~-]{1,512}$/;

const numberFormat = new Intl.NumberFormat("en");

/**
 * The project these params name and its pages' base address; else a 404. As
 * the API has it (getProjectRecord): its author's card comes without a
 * handle, which takes outside lookups (AuthorLink streams it in).
 */
export async function projectFrom(params: ProjectParams) {
  const { actor: id, rkey } = await params;
  if (!RKEY.test(rkey)) notFound();
  // The route accepts a handle or DID; the collection URI needs the DID,
  // which a DID in the URL already is.
  const did = await didOfSegment(decodeURIComponent(id));
  if (!did) notFound();
  const uri = `at://${did}/org.hypercerts.collection/${rkey}`;
  const project = await getProjectRecord(uri);
  if (!project) notFound();
  return { project, uri, base: `/${decodeURIComponent(id)}/project/${rkey}` };
}

/** "158 followers", beside the author. */
async function FollowerCount({ uri }: { uri: string }) {
  await connection(); // per visit: not in the cached page
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
      follow={actingAs ? getEntityFollow(actingAs, uri) : null}
    />
  );
}

const TABS = [
  { label: "Overview", path: "" },
  { label: "Activities", path: "/activities" },
  { label: "Followers", path: "/followers" },
  { label: "Badges", path: "/badges" },
  { label: "Funding", path: "/funding" },
] as const;

/**
 * Every tab, from the address alone, so they show with the page; a tab's
 * page loads on hover or focus (ProfileTabs). No numbers: the figures beside
 * them have them.
 */
export async function ProjectTabs({ params }: { params: ProjectParams }) {
  const { actor, rkey } = await params;
  const base = `/${decodeURIComponent(actor)}/project/${rkey}`;
  return (
    <ProfileTabs
      label="Project"
      tabs={TABS.map((tab) => ({
        label: tab.label,
        href: `${base}${tab.path}`,
      }))}
    />
  );
}

export function ProjectTabsSkeleton() {
  return <ProfileTabsSkeleton labels={TABS.map((tab) => tab.label)} />;
}

/** Where the project is, as a map with its name, when it says. */
async function ProjectLocation({
  locationUri,
  title,
  imageUrl,
}: {
  locationUri: string;
  title: string;
  imageUrl: string | null;
}) {
  await connection(); // per visit: not in the cached page
  const place = await getPlace(locationUri);
  if (!place) return null;
  return <LocationCard place={place} who={title} imageUrl={imageUrl} />;
}

/** The side column: where, what was measured, attachments; each only when there is one. */
/** The column beside every tab: figures, where it is, and what identifies it. */
export async function ProjectRail({ params }: { params: ProjectParams }) {
  const { project, uri, base } = await projectFrom(params);
  return (
    <>
      <TileSlot title="In numbers" skeleton={null}>
        <RecordFigures uri={uri} base={base} activities={project.activityCount} />
      </TileSlot>
      {project.locationUri && (
        <TileSlot title="Location" skeleton={null}>
          <ProjectLocation
            locationUri={project.locationUri}
            title={project.title}
            imageUrl={project.imageUrl ?? project.author.avatarUrl}
          />
        </TileSlot>
      )}
      <RecordFacts title="Project" uri={uri} facts={[["Created", project.createdAt]]} />
    </>
  );
}

export async function ProjectHeader({ params }: { params: ProjectParams }) {
  const { project, uri, base } = await projectFrom(params);
  const lead = leadOf(project.summary, project.description);
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
            <Text as="span" size="body-sm">
              <AuthorLink author={project.author} />
            </Text>
            <Suspense fallback={null}>
              <FollowerCount uri={uri} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <AlsoOn subject={uri} what="project" />
          </Suspense>
          {/* The short description leads; the long one fades out above Read
              more, as a profile's does. */}
          {lead && (
            <Text className="project-lead measure" dir="auto">
              {lead}
            </Text>
          )}
          {project.description && (
            <ExpandableText lines={4} className="expandable-fade measure">
              <RichText text={project.description} />
            </ExpandableText>
          )}
        </div>
        <div className="record-head-actions">
          {/* Shown at once; who is viewing and whether they follow stream in. */}
          <Suspense
            fallback={<FollowControl subject={uri} path={base} actor={undefined} follow={null} />}
          >
            <ProjectFollow uri={uri} author={project.authorDid} path={base} />
          </Suspense>
          <Suspense fallback={null}>
            <RecordActions uri={uri} path={base} title={project.title} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/** The header on its way: what it is, by whom. */
export function ProjectHeaderSkeleton() {
  return (
    <div className="stack" aria-hidden>
      <Eyebrow>Project</Eyebrow>
      <Skeleton variant="line" className="skeleton-name" />
      <Skeleton variant="line" className="skeleton-meta" />
      <Skeleton variant="text" lines={3} className="skeleton-lead" />
    </div>
  );
}
