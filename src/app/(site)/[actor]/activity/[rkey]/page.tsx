import { Avatar, Eyebrow, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { actorHref } from "@/components/cards";
import { Funding, FundingSkeleton } from "@/components/funding";
import { PageTitle } from "@/components/page-title";
import { Tile, TileSkeleton } from "@/components/tile";
import { TileSlot } from "@/components/tile-slot";
import { getActivity, getActor } from "@/lib/hypercerts/queries";

// An activity's own page, laid out like a blog post: its title, by whom and
// when, its picture as a hero image, the full text, then the funding
// recorded for it.

/** A record key as AT Protocol allows it; anything else is no activity. */
const RKEY = /^[A-Za-z0-9._:~-]{1,512}$/;

async function activityFrom(params: Promise<{ actor: string; rkey: string }>) {
  const { actor: id, rkey } = await params;
  if (!RKEY.test(rkey)) notFound();
  const actor = await getActor(decodeURIComponent(id));
  if (!actor) notFound();
  const activity = await getActivity(`at://${actor.did}/org.hypercerts.claim.activity/${rkey}`);
  if (!activity) notFound();
  return activity;
}

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/activity/[rkey]">): Promise<Metadata> {
  const activity = await activityFrom(params);
  return { title: activity.title };
}

async function ActivityFunding({ uri }: { uri: string }) {
  return (
    <Tile title="Funding">
      <Funding
        filter={{ for: uri }}
        label="Received"
        omit="for"
        empty="No funding recorded for this activity yet."
      />
    </Tile>
  );
}

async function Activity({ params }: Pick<PageProps<"/[actor]/activity/[rkey]">, "params">) {
  const activity = await activityFrom(params);
  const { author } = activity;
  return (
    <>
      <article className="activity-post">
        <header className="stack">
          <Eyebrow>Activity</Eyebrow>
          <PageTitle>
            <span dir="auto">{activity.title}</span>
          </PageTitle>
          <div className="project-meta">
            <Link prefetch href={actorHref(author)} className="meta-author">
              <Avatar name={author.displayName} src={author.avatarUrl} size="sm" />
              <Text as="span" size="body-sm">
                {author.displayName}
              </Text>
            </Link>
            {(activity.period ?? activity.createdAt) && (
              <Text as="span" size="body-sm" tone="muted">
                {activity.period ?? activity.createdAt}
              </Text>
            )}
          </div>
        </header>
        {activity.imageUrl && (
          <div className="activity-hero">
            {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
            <img src={activity.imageUrl} alt="" />
          </div>
        )}
        {/* The full text, as a post reads: never cut (the short one when
            there is no other). */}
        {(activity.description ?? activity.summary) && (
          <Text relaxed className="prewrap activity-body" dir="auto">
            {activity.description ?? activity.summary}
          </Text>
        )}
      </article>
      <TileSlot title="Funding" skeleton={<FundingSkeleton />}>
        <ActivityFunding uri={activity.uri} />
      </TileSlot>
    </>
  );
}

/** The activity on its way: its header, then funding. */
function ActivitySkeleton() {
  return (
    <>
      <div className="stack" aria-hidden>
        <Eyebrow>Activity</Eyebrow>
        <Skeleton variant="line" className="skeleton-name" />
        <Skeleton variant="line" className="skeleton-meta" />
        <Skeleton variant="text" lines={3} className="skeleton-lead" />
      </div>
      <TileSkeleton title="Funding">
        <FundingSkeleton />
      </TileSkeleton>
    </>
  );
}

export default function ActivityPage(props: PageProps<"/[actor]/activity/[rkey]">) {
  return (
    <div className="page">
      <Suspense fallback={<ActivitySkeleton />}>
        <Activity params={props.params} />
      </Suspense>
    </div>
  );
}
