import { Card, CopyableId, Heading, IdentityRow, Skeleton, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { ActivityCardView, actorHref, ProjectCardView } from "@/components/cards";
import { TileSlot } from "@/components/tile-slot";
import { BadgesAwardedTile, BadgesTile } from "@/components/tiles";
import {
  getActor,
  getEndorsements,
  hasIssuedAwards,
  listActivitiesPage,
  listProjectsPage,
} from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

// The profile's Overview: a reading column with the account's latest work
// (projects, activities), who endorsed it and its badges, beside a rail with
// the Account facts. Sections with nothing in them are left out.

const PREVIEW = 4;
const ENDORSEMENTS_PREVIEW = 3;

export async function generateMetadata({ params }: PageProps<"/[actor]">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor?.displayName ?? "Not found" };
}

function Section({
  title,
  seeAll,
  children,
}: {
  title: string;
  seeAll?: string;
  children: ReactNode;
}) {
  return (
    <section className="profile-section">
      <div className="profile-section-header">
        <Heading level={2} size="heading">
          {title}
        </Heading>
        {seeAll && (
          <Link href={seeAll} className="see-all">
            See all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

async function ProjectsPreview({ did, base }: { did: string; base: string }) {
  const page = await listProjectsPage({ author: did });
  if (page.items.length === 0) return null;
  const more = page.items.length > PREVIEW || page.cursor;
  return (
    <Section title="Projects" seeAll={more ? `${base}/projects` : undefined}>
      <ul className="work-grid">
        {page.items.slice(0, PREVIEW).map((project) => (
          <ProjectCardView key={project.uri} project={project} />
        ))}
      </ul>
    </Section>
  );
}

async function ActivitiesPreview({ did, base }: { did: string; base: string }) {
  const page = await listActivitiesPage({ author: did, limit: PREVIEW });
  if (page.items.length === 0) return null;
  return (
    <Section title="Activities" seeAll={page.cursor ? `${base}/activities` : undefined}>
      <ul className="work-grid">
        {page.items.map((activity) => (
          <ActivityCardView key={activity.uri} activity={activity} showAuthor={false} />
        ))}
      </ul>
    </Section>
  );
}

/** The latest endorsements received: badge awards of type "endorsement". */
async function EndorsedBy({ did, base }: { did: string; base: string }) {
  const { latestReceived, receivedCount } = await getEndorsements(did, ENDORSEMENTS_PREVIEW);
  if (latestReceived.length === 0) return null;
  return (
    <Section title={`Endorsed by ${receivedCount}`} seeAll={`${base}/endorsements`}>
      <ul className="overview-rows">
        {latestReceived.map((endorsement) => (
          <li key={endorsement.uri}>
            <IdentityRow
              size="sm"
              name={endorsement.issuer.displayName}
              avatarSrc={endorsement.issuer.avatarUrl}
              href={actorHref(endorsement.issuer.did)}
              secondary={
                [endorsement.note, endorsement.createdAt].filter(Boolean).join(" · ") || undefined
              }
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

async function AwardsIssued({ did }: { did: string }) {
  if (!(await hasIssuedAwards(did))) return null;
  return (
    <TileSlot title="Badges awarded">
      <BadgesAwardedTile did={did} />
    </TileSlot>
  );
}

async function Overview({ params }: Pick<PageProps<"/[actor]">, "params">) {
  const { actor, base } = await profileActor(params, "");
  const { did } = actor;
  // A DID URL with a handle has redirected, so the URL names the handle if
  // there is one.
  const handle = base.startsWith("/did:") ? null : base.slice(1);
  const about = actor.profile.description.trim() && actor.longDescription;

  return (
    <div className="profile-overview">
      <div className="profile-main">
        {/* The header's lead is the bio, so an organization's longer
            description gets its own section. */}
        {about && (
          <Section title="About">
            <Text relaxed className="prewrap" dir="auto">
              {about}
            </Text>
          </Section>
        )}
        <Suspense fallback={<Skeleton variant="text" lines={4} />}>
          <ProjectsPreview did={did} base={base} />
        </Suspense>
        <Suspense fallback={<Skeleton variant="text" lines={4} />}>
          <ActivitiesPreview did={did} base={base} />
        </Suspense>
        <Suspense fallback={null}>
          <EndorsedBy did={did} base={base} />
        </Suspense>
        <TileSlot title="Badges received">
          <BadgesTile did={did} />
        </TileSlot>
        <Suspense fallback={null}>
          <AwardsIssued did={did} />
        </Suspense>
      </div>
      <aside className="profile-rail" aria-label="Account">
        <Card variant="panel" className="overview-box">
          <Heading level={2} size="heading">
            Account
          </Heading>
          <dl className="facts">
            {actor.joined && (
              <div className="fact">
                <dt>Joined</dt>
                <dd>{actor.joined}</dd>
              </div>
            )}
            {handle && (
              <div className="fact">
                <dt>Handle</dt>
                <dd>@{handle}</dd>
              </div>
            )}
            <div className="fact">
              <dt>Permanent ID</dt>
              <dd>
                <CopyableId value={did} displayValue={did} label="Permanent ID" />
              </dd>
            </div>
          </dl>
        </Card>
      </aside>
    </div>
  );
}

export default function ProfileOverviewPage(props: PageProps<"/[actor]">) {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Overview params={props.params} />
    </Suspense>
  );
}
