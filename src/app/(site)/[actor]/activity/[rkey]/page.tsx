import { Eyebrow, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActorLink, ActorRow } from "@/components/actor";
import { actorHref } from "@/components/cards";
import { Funding } from "@/components/funding";
import { PageTitle } from "@/components/page-title";
import { Tile } from "@/components/tile";
import { TileSlot } from "@/components/tile-slot";
import { getActivity, getActor, listReceiptsPage } from "@/lib/hypercerts/queries";
import type { Contributor } from "@/lib/hypercerts/views";

// An activity's own page, laid out like a blog post: its title, by whom,
// when and in what scope, its picture as a hero image, the full text, then
// who did the work and the funding recorded for it.

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

/** Funding recorded for the activity; nothing at all without any (no one looks for it here). */
async function ActivityFunding({ uri }: { uri: string }) {
  const { items } = await listReceiptsPage({ for: uri });
  if (items.length === 0) return null;
  return (
    <Tile title="Funding">
      <Funding filter={{ for: uri }} label="Received" omit="for" empty="No funding yet" />
    </Tile>
  );
}

/** Who did the work: an account links to its profile; role beneath, share on the right. */
function Contributors({ contributors }: { contributors: Contributor[] }) {
  return (
    <Tile title="Contributors">
      <ul className="people-list">
        {contributors.map((c) => (
          <li key={c.key} className="people-row">
            <ActorRow
              actor={c.actor ?? { handle: null, displayName: c.name, avatarUrl: c.avatarUrl }}
              href={c.actor ? actorHref(c.actor) : null}
              secondary={c.role}
            />
            {c.share && (
              <Text as="span" size="body-sm" tone="muted" className="people-date">
                {c.share}
              </Text>
            )}
          </li>
        ))}
      </ul>
    </Tile>
  );
}

async function Activity({ params }: Pick<PageProps<"/[actor]/activity/[rkey]">, "params">) {
  const activity = await activityFrom(params);
  const { author } = activity;
  // When, then the work scope, as Explore's rows say them.
  const meta = [activity.period ?? activity.createdAt, activity.scope].filter(Boolean).join(" · ");
  return (
    <>
      <article className="activity-post">
        <header className="stack">
          <Eyebrow>Activity</Eyebrow>
          <PageTitle>
            <span dir="auto">{activity.title}</span>
          </PageTitle>
          <div className="project-meta">
            <Text as="span" size="body-sm">
              <ActorLink actor={author} />
            </Text>
            {meta && (
              <Text as="span" size="body-sm" tone="muted">
                {meta}
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
      {activity.contributors.length > 0 && <Contributors contributors={activity.contributors} />}
      {/* No skeleton: the tile may not be there at all. */}
      <TileSlot title="Funding" skeleton={null}>
        <ActivityFunding uri={activity.uri} />
      </TileSlot>
    </>
  );
}

/** The activity on its way: its header. */
function ActivitySkeleton() {
  return (
    <div className="stack" aria-hidden>
      <Eyebrow>Activity</Eyebrow>
      <Skeleton variant="line" className="skeleton-name" />
      <Skeleton variant="line" className="skeleton-meta" />
      <Skeleton variant="text" lines={3} className="skeleton-lead" />
    </div>
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
