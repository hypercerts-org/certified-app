// An activity's page, laid out as a project's is (project-page): its header
// (what it is, by whom, when and in what scope, its picture), then two
// columns. On the left its pages as tabs, each its own URL: Overview (the
// default: its text, then a timeline of what happened in it), Contributors
// and Badges (when it has any), Funding. On the right what stays put: its
// figures, the projects it is part of, and its identifiers.

import { Eyebrow, IdentityRow, Skeleton, Text } from "@hypercerts-org/ui-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { identityOf } from "@/components/actor";
import { AuthorLink } from "@/components/author-link";
import { actorHref } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import { ProfileTabsSkeleton, RouteTabs } from "@/components/profile-actions";
import { RecordActions, RecordActionsFallback } from "@/components/record-actions";
import { PartOf } from "@/components/record-context";
import { RecordFacts, RecordFigures } from "@/components/record-rail";
import { TileSlot } from "@/components/tile-slot";
import { didOfSegment, getActivityRecord } from "@/lib/hypercerts/queries";
import type { Contributor } from "@/lib/hypercerts/views";
import { isRkey } from "@/lib/validate";

export type ActivityParams = Promise<{ actor: string; rkey: string }>;

/**
 * The activity these params name, and its pages' base address; else a 404.
 * As the API has it (getActivityRecord): its accounts' cards come without
 * handles, which take outside lookups (AuthorLink and the Contributors tab
 * add them).
 */
export async function activityFrom(params: ActivityParams) {
  const { actor: id, rkey } = await params;
  if (!isRkey(rkey)) notFound();
  // The route accepts a handle or DID; the record's URI needs the DID, which
  // a DID in the URL already is.
  const did = await didOfSegment(decodeURIComponent(id));
  if (!did) notFound();
  const uri = `at://${did}/org.hypercerts.claim.activity/${rkey}`;
  const activity = await getActivityRecord(uri);
  if (!activity) notFound();
  return { activity, uri, base: `/${decodeURIComponent(id)}/activity/${rkey}` };
}

const TABS = [
  { label: "Overview", path: "" },
  { label: "Contributors", path: "/contributors" },
  { label: "Badges", path: "/badges" },
  { label: "Funding", path: "/funding" },
] as const;

/**
 * Every tab, from the address alone, so they show with the App Shell; a tab's
 * page loads on hover or focus (ProfileTabs). No numbers.
 */
export function ActivityTabs() {
  return <RouteTabs label="Activity" baseSegments={3} tabs={TABS} />;
}

export function ActivityTabsSkeleton() {
  return <ProfileTabsSkeleton labels={TABS.map((tab) => tab.label)} />;
}

/** The column beside every tab: figures, the projects it is part of, what identifies it. */
export async function ActivityRail({ params }: { params: ActivityParams }) {
  const { activity, uri, base } = await activityFrom(params);
  return (
    <>
      <TileSlot title="In numbers" skeleton={null}>
        <RecordFigures uri={uri} base={base} />
      </TileSlot>
      <TileSlot title="Part of" skeleton={null}>
        <PartOf uri={uri} />
      </TileSlot>
      <RecordFacts
        title="Activity"
        uri={uri}
        // The header gives when the work happened, else when it was published.
        facts={[["Published", activity.period ? activity.createdAt : null]]}
      />
    </>
  );
}

/** Title, by whom, when and in what scope; its picture beside, as a blog post's hero. */
export async function ActivityHeader({ params }: { params: ActivityParams }) {
  const { activity, uri, base } = await activityFrom(params);
  // When, then the work scope, as Explore's rows say them.
  const meta = [activity.period ?? activity.createdAt, activity.scope].filter(Boolean).join(" · ");
  return (
    <header className="activity-head">
      <div className="activity-head-top">
        <div className="stack">
          <Eyebrow>Activity</Eyebrow>
          <PageTitle>
            <span dir="auto">{activity.title}</span>
          </PageTitle>
          <div className="project-meta">
            <Text as="span" size="body-sm">
              <AuthorLink author={activity.author} />
            </Text>
            {meta && (
              <Text as="span" size="body-sm" tone="muted">
                {meta}
              </Text>
            )}
          </div>
        </div>
        <div className="record-head-actions">
          <Suspense
            fallback={<RecordActionsFallback uri={uri} path={base} title={activity.title} />}
          >
            <RecordActions uri={uri} path={base} title={activity.title} />
          </Suspense>
        </div>
      </div>
      {activity.imageUrl && (
        <div className="activity-hero">
          {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
          <img src={activity.imageUrl} alt="" />
        </div>
      )}
    </header>
  );
}

/** The header on its way. */
export function ActivityHeaderSkeleton() {
  return (
    <div className="stack" aria-hidden>
      <Eyebrow>Activity</Eyebrow>
      <Skeleton variant="line" className="skeleton-name" />
      <Skeleton variant="line" className="skeleton-meta" />
    </div>
  );
}

/** Who did the work: an account links to its profile; role beneath, share on the right. */
export function Contributors({ contributors }: { contributors: Contributor[] }) {
  return (
    <ul className="people-list divided">
      {contributors.map((c) => (
        <li key={c.key} className="people-row">
          <IdentityRow
            {...identityOf(
              c.actor ?? { handle: null, displayName: c.name, avatarUrl: c.avatarUrl },
            )}
            href={c.actor ? actorHref(c.actor) : undefined}
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
  );
}
