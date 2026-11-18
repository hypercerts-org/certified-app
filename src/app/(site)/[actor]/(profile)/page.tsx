import {
  Avatar,
  Card,
  CopyableId,
  Heading,
  IdentityRow,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { ActivityCardView, actorHref, ProjectCardView } from "@/components/cards";
import { ComingSoonButton } from "@/components/coming-soon";
import { OwnerOnly, VisitorOnly } from "@/components/viewer-only";
import {
  getActor,
  listActivitiesPage,
  listEndorsements,
  listFollows,
  listProjectsPage,
} from "@/lib/hypercerts/queries";
import type { ActivityCard, ActorCard, PersonRow, ProjectCard } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

// The profile's Overview, after the staging redesign: a reading column with
// About, the latest activities and projects, the accounts it endorses
// ("Endorses N") and those that endorsed it ("Endorsed by N"), beside a rail
// with the Account facts. A visitor sees only sections with something in
// them; the account itself (whoever acts as it) sees every section, with the
// action that fills an empty one. An account with nothing public says so,
// and shows whom it follows.

/** Work cards per section. */
const PREVIEW = 4;
/** Rows in "Endorsed by". */
const ENDORSEMENTS_PREVIEW = 3;
/** Accounts in the "Endorses" and "Follows" grids. */
const GRID_PREVIEW = 12;

const numberFormat = new Intl.NumberFormat("en");

export async function generateMetadata({ params }: PageProps<"/[actor]">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor?.displayName ?? "Not found" };
}

function Section({
  title,
  count,
  seeAll,
  children,
}: {
  title: string;
  /** Shown after the title, quieter ("Endorses 11"). */
  count?: string;
  seeAll?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="profile-section">
      <div className="profile-section-header">
        <Heading level={2} size="display-3">
          {title}
          {count && <span className="profile-section-count"> {count}</span>}
        </Heading>
        {seeAll && (
          <Link href={seeAll.href} className="see-all">
            {seeAll.label}
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** An empty section on the account's own profile: what goes here, and how. */
function Empty({ text, action }: { text: string; action?: string }) {
  return (
    <div className="profile-empty">
      <Text tone="muted">{text}</Text>
      {action && (
        // A placeholder until the Hypercerts SDK ships the write.
        <ComingSoonButton>{action}</ComingSoonButton>
      )}
    </div>
  );
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** An activity its own same-titled project already shows: the project card stands for both. */
function coveredByProject(activity: ActivityCard, projects: ProjectCard[]): boolean {
  return projects.some(
    (project) =>
      sameTitle(project.title, activity.title) && project.activityUris.includes(activity.uri),
  );
}

/** Each account once, newest first. */
function uniqueActors(rows: PersonRow[]): { actor: ActorCard; row: PersonRow }[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => !seen.has(row.actor.did) && seen.add(row.actor.did))
    .map((row) => ({ actor: row.actor, row }));
}

const countLabel = (count: number, more: boolean) =>
  `${numberFormat.format(count)}${more ? "+" : ""}`;

/** A grid of accounts, each avatar and name to its profile. */
function AccountGrid({ actors }: { actors: ActorCard[] }) {
  // An account without a Certified profile has only its DID for a name: its
  // handle reads better.
  const shown = actors
    .slice(0, GRID_PREVIEW)
    .map((actor) =>
      actor.displayName === actor.did && actor.handle
        ? { ...actor, displayName: `@${actor.handle}` }
        : actor,
    );
  return (
    <ul className="account-grid">
      {shown.map((actor) => (
        <li key={actor.did}>
          <Link prefetch href={actorHref(actor)} className="account-grid-link">
            <Avatar
              // A handle's initial, not "@".
              name={actor.displayName.replace(/^@/, "")}
              src={actor.avatarUrl}
              size="md"
              className={actor.isOrganization ? "avatar-square" : undefined}
            />
            <span className="account-grid-name" dir="auto">
              {actor.displayName}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Work({ did, base }: { did: string; base: string }) {
  const [activityPage, projectPage] = await Promise.all([
    listActivitiesPage({ author: did, limit: PREVIEW * 2 }),
    listProjectsPage({ author: did }),
  ]);
  const projects = projectPage.items;
  const activities = activityPage.items.filter((a) => !coveredByProject(a, projects));
  const moreActivities = activities.length > PREVIEW || Boolean(activityPage.cursor);

  // An empty section is shown only to the account itself, with what fills it;
  // a visitor doesn't get an Activities section that only repeats the projects.
  const activitiesSection = (
    <Section
      title="Activities"
      seeAll={moreActivities ? { href: `${base}/activities`, label: "All activities" } : undefined}
    >
      {activities.length > 0 ? (
        <ul className="work-grid">
          {activities.slice(0, PREVIEW).map((activity) => (
            <ActivityCardView key={activity.uri} activity={activity} showAuthor={false} />
          ))}
        </ul>
      ) : (
        <Empty
          text={
            activityPage.items.length > 0
              ? "Each activity is in its project below."
              : "No activities yet. Activities you publish or contribute to show here."
          }
          action={activityPage.items.length > 0 ? undefined : "New activity"}
        />
      )}
    </Section>
  );
  const projectsSection = (
    <Section
      title="Projects"
      seeAll={
        projects.length > PREVIEW || projectPage.cursor
          ? { href: `${base}/projects`, label: "All projects" }
          : undefined
      }
    >
      {projects.length > 0 ? (
        <ul className="work-grid">
          {projects.slice(0, PREVIEW).map((project) => (
            <ProjectCardView key={project.uri} project={project} />
          ))}
        </ul>
      ) : (
        <Empty text="No projects yet. A project groups related activities." action="New project" />
      )}
    </Section>
  );
  return (
    <>
      {activities.length > 0 ? (
        activitiesSection
      ) : (
        <OwnerOnly did={did}>{activitiesSection}</OwnerOnly>
      )}
      {projects.length > 0 ? projectsSection : <OwnerOnly did={did}>{projectsSection}</OwnerOnly>}
    </>
  );
}

/** The accounts this one endorses, newest first. */
async function Endorses({ did, base }: { did: string; base: string }) {
  const { rows, more } = await listEndorsements(did, "given");
  const actors = uniqueActors(rows).map(({ actor }) => actor);
  if (actors.length === 0) return null;
  const label = countLabel(actors.length, more);
  return (
    <Section
      title="Endorses"
      count={label}
      seeAll={
        actors.length > GRID_PREVIEW
          ? { href: `${base}/endorsements/given`, label: `All ${label}` }
          : undefined
      }
    >
      <AccountGrid actors={actors} />
    </Section>
  );
}

/** The accounts that endorsed this one, each once with its latest endorsement. */
async function EndorsedBy({ did, base }: { did: string; base: string }) {
  const { rows, more } = await listEndorsements(did, "received");
  const endorsers = uniqueActors(rows);
  if (endorsers.length === 0) {
    return (
      <OwnerOnly did={did}>
        <Section title="Endorsed by">
          <Empty text="No endorsements yet. When another account endorses this one, it shows here." />
        </Section>
      </OwnerOnly>
    );
  }
  return (
    <Section
      title="Endorsed by"
      count={countLabel(endorsers.length, more)}
      seeAll={{ href: `${base}/endorsements`, label: "All endorsements" }}
    >
      <ul className="overview-rows">
        {endorsers.slice(0, ENDORSEMENTS_PREVIEW).map(({ actor, row }) => (
          <li key={row.uri}>
            <IdentityRow
              size="md"
              name={actor.displayName}
              avatarSrc={actor.avatarUrl}
              href={actorHref(actor)}
              secondary={[row.date, row.note].filter(Boolean).join(" · ") || undefined}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * For a visitor, when the account has published nothing: says so, then
 * whom it follows, which is what there is to see.
 */
async function NothingPublic({ did, base, about }: { did: string; base: string; about: boolean }) {
  if (about) return null;
  const [activities, projects, given, received] = await Promise.all([
    listActivitiesPage({ author: did, limit: 1 }),
    listProjectsPage({ author: did }),
    listEndorsements(did, "given"),
    listEndorsements(did, "received"),
  ]);
  const empty =
    activities.items.length === 0 &&
    projects.items.length === 0 &&
    given.rows.length === 0 &&
    received.rows.length === 0;
  if (!empty) return null;
  const following = await listFollows(did, "following");
  const followed = uniqueActors(following.rows).map(({ actor }) => actor);
  // The account itself sees its empty sections instead.
  return (
    <VisitorOnly did={did}>
      <div className="profile-nothing">
        <Heading level={2} size="display-3">
          No public records yet.
        </Heading>
        <Text tone="muted">When this account publishes something, it shows here.</Text>
      </div>
      {followed.length > 0 && (
        <Section
          title="Follows"
          count={countLabel(followed.length, following.more)}
          seeAll={
            followed.length > GRID_PREVIEW ? { href: `${base}/following`, label: "All" } : undefined
          }
        >
          <AccountGrid actors={followed} />
        </Section>
      )}
    </VisitorOnly>
  );
}

/** A section on its way: its heading and two cards' worth of room. */
function SectionSkeleton() {
  return (
    <div className="profile-section" aria-hidden>
      <Skeleton variant="line" className="skeleton-heading" />
      <div className="work-grid">
        <Skeleton variant="box" className="skeleton-card" />
        <Skeleton variant="box" className="skeleton-card" />
      </div>
    </div>
  );
}

/** The Overview on its way: shaped like its column of sections and the rail. */
function OverviewSkeleton() {
  return (
    <div className="profile-overview" aria-hidden>
      <div className="profile-main">
        <SectionSkeleton />
      </div>
      <div className="profile-rail">
        <Skeleton variant="box" className="skeleton-rail" />
      </div>
    </div>
  );
}

async function Overview({ params }: Pick<PageProps<"/[actor]">, "params">) {
  const { actor, base } = await profileActor(params, "");
  const { did, handle } = actor;
  const about = actor.profile.description.trim() ? actor.longDescription : null;

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
        <Suspense fallback={<SectionSkeleton />}>
          <Work did={did} base={base} />
        </Suspense>
        <Suspense fallback={null}>
          <Endorses did={did} base={base} />
        </Suspense>
        <Suspense fallback={null}>
          <EndorsedBy did={did} base={base} />
        </Suspense>
        <Suspense fallback={null}>
          <NothingPublic did={did} base={base} about={Boolean(about)} />
        </Suspense>
      </div>
      <aside className="profile-rail" aria-label="Facts about this account">
        <Card variant="panel" className="overview-box">
          <Heading level={2} size="heading">
            Account
          </Heading>
          <dl className="facts">
            {actor.place && (
              <div className="fact">
                <dt>Location</dt>
                <dd>{actor.place}</dd>
              </div>
            )}
            {/* A person's joining is on the header's meta line. */}
            {actor.isOrganization && actor.joined && (
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
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview params={props.params} />
    </Suspense>
  );
}
