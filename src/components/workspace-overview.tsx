// The workspace overview: what an account holds (its records, endorsements
// and followers), its identity and ID, its organizations (your own workspace
// only) and the apps it can sign in to. After the staging redesign's
// Workspace → Overview, with its data from the Hypercerts API.
//
//   ≥ 1100px                                 < 1100px (one column)
//   ┌──────────────────────┐ ┌───────────┐   Your records
//   │ Your records         │ │ identity, │   Endorsements and followers
//   │ Endorsements and     │ │ ID        │   identity, ID (box)
//   │   followers          │ └───────────┘   Your organizations (box)
//   │ Apps                 │ ┌───────────┐   Apps
//   │                      │ │ Your orgs │
//   └──────────────────────┘ └───────────┘
//
// The DOM is the one-column order at every width, so the keyboard follows the
// page; from 1100px a grid moves the boxes to the right (globals.css). Each
// section reads its own data behind its own Suspense boundary, with a
// skeleton shaped like it. All but the organizations are cached public data
// about the account, so a prefetching link brings them along.

import {
  Button,
  Card,
  CopyableId,
  Eyebrow,
  Heading,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { ArrowUpRight, FileBadge, Link2, Plus, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, Suspense, useId } from "react";
import { ActorAvatar, ActorHandle, ActorLink, ActorRow } from "@/components/actor";
import { actorHref, workspaceHref } from "@/components/cards";
import { Empty } from "@/components/empty";
import { AddMemberDialog, MemberActions, NewGroupDialog } from "@/components/group-dialogs";
import { PageTitle } from "@/components/page-title";
import { ActivityRow, ProjectRow, RecordRowSkeleton } from "@/components/records";
import { StatRow } from "@/components/stat-row";
import { APPS } from "@/lib/apps";
import {
  getActor,
  getEndorsements,
  getFollowCounts,
  getRecordCounts,
  listLatestRecords,
} from "@/lib/hypercerts/queries";
import { type ActorCard, type ActorDetail, endorsementLine, nameOf } from "@/lib/hypercerts/views";
import type { Organization } from "@/lib/organizations";

const LATEST_RECORDS = 4;

export function WorkspaceOverview({
  did,
  organizations,
}: {
  did: string;
  /** Your organizations, on your own workspace; null on an organization's. */
  organizations: ReactNode | null;
}) {
  return (
    <>
      <PageTitle className="workspace-title">Overview</PageTitle>
      <div className="overview">
        <div className="overview-main">
          <Suspense fallback={<StatsSkeleton title="Your records" stats={3} rows={3} />}>
            <RecordsSection did={did} />
          </Suspense>
          <Suspense
            fallback={<StatsSkeleton title="Endorsements and followers" stats={4} rows={2} />}
          >
            <EndorsementsSection did={did} />
          </Suspense>
        </div>
        <div className="overview-side">
          <Card variant="panel" className="overview-box">
            <Suspense fallback={<IdentitySkeleton />}>
              <IdentityBox did={did} />
            </Suspense>
          </Card>
          {organizations && (
            <Card variant="panel" className="overview-box">
              {organizations}
            </Card>
          )}
        </div>
        <div className="overview-apps">
          <AppsSection />
        </div>
      </div>
    </>
  );
}

// Shared ---------------------------------------------------------------------

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** Beside the title, on the right ("New activity", "New group"). */
  action?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="overview-section" aria-labelledby={titleId}>
      <div className="overview-section-head">
        <div className="section-heading">
          <Heading level={2} size="heading" id={titleId}>
            {title}
          </Heading>
          {description && <Text tone="muted">{description}</Text>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Skeletons, shaped like the sections, so nothing moves when they arrive.

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overview-rows divided" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
        <RecordRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** A section of counts and latest rows. Its title is known, so it shows. */
function StatsSkeleton({ title, stats, rows }: { title: string; stats: number; rows: number }) {
  return (
    <Section title={title}>
      <div className="stat-row" aria-hidden>
        {Array.from({ length: stats }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
          <Skeleton key={i} variant="box" className="skeleton-stat" />
        ))}
      </div>
      <RowsSkeleton rows={rows} />
    </Section>
  );
}

function IdentitySkeleton() {
  return (
    <div className="overview-identity" aria-hidden>
      <Skeleton variant="box" className="skeleton-identity-avatar" />
      <div className="overview-identity-text">
        <Skeleton variant="line" className="skeleton-meta" />
        <Skeleton variant="text" lines={2} />
      </div>
    </div>
  );
}

export function OrganizationsSkeleton() {
  return (
    <Section title="Your groups">
      <RowsSkeleton rows={2} />
    </Section>
  );
}

/** The whole overview, while the page works out whose workspace it is. */
export function OverviewSkeleton() {
  return (
    <>
      <PageTitle className="workspace-title">Overview</PageTitle>
      <div className="overview">
        <div className="overview-main">
          <StatsSkeleton title="Your records" stats={3} rows={3} />
          <StatsSkeleton title="Endorsements and followers" stats={4} rows={2} />
        </div>
        <div className="overview-side">
          <Card variant="panel" className="overview-box">
            <IdentitySkeleton />
          </Card>
        </div>
      </div>
    </>
  );
}

/** "1 Activity", "3 Activities". */
const byCount = (n: number, one: string, many: string) => (n === 1 ? one : many);

function ListLabel({ children }: { children: ReactNode }) {
  // A heading for the outline, an eyebrow to look at (Eyebrow can't be a
  // heading itself: toolkit gap).
  return (
    <h3 className="overview-list-label">
      <Eyebrow as="span">{children}</Eyebrow>
    </h3>
  );
}

// Records --------------------------------------------------------------------

async function RecordsSection({ did }: { did: string }) {
  const [counts, latest] = await Promise.all([
    getRecordCounts(did),
    listLatestRecords(did, LATEST_RECORDS),
  ]);
  const work = `${workspaceHref(did)}/projects`;
  const empty =
    latest.length === 0 &&
    counts.activities.value === 0 &&
    counts.projects.value === 0 &&
    counts.lists.value === 0;

  return (
    <Section title="Your records" description="What you have published, here or in other apps.">
      {empty ? (
        <Empty
          icon={FileBadge}
          title="No records yet"
          description="Activities and projects you publish, here or in other apps, show up here."
          action={
            <div className="empty-actions">
              {/* Without records, a way to start; the projects page has these too. */}
              <Button href={`${work}/new-activity`} variant="primary">
                <Plus size={16} aria-hidden />
                New activity
              </Button>
              <Button href={`${work}/new-project`} variant="secondary">
                <Plus size={16} aria-hidden />
                New project
              </Button>
              <Button href="/explore" variant="secondary">
                <Search size={16} aria-hidden />
                Find accounts
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <StatRow
            label="Records by kind"
            stats={[
              {
                label: byCount(counts.activities.value, "Activity", "Activities"),
                value: counts.activities,
                href: work,
              },
              {
                label: byCount(counts.projects.value, "Project", "Projects"),
                value: counts.projects,
                href: work,
              },
              {
                label: byCount(counts.lists.value, "List", "Lists"),
                value: counts.lists,
                href: `${workspaceHref(did)}/lists`,
              },
            ]}
          />
          {latest.length > 0 && (
            <div className="overview-list">
              <ListLabel>Latest</ListLabel>
              <ul className="overview-rows divided">
                {latest.map((record) =>
                  record.kind === "activity" ? (
                    <li key={record.activity.uri}>
                      <ActivityRow activity={record.activity} />
                    </li>
                  ) : (
                    <li key={record.project.uri}>
                      <ProjectRow project={record.project} />
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// Endorsements and followers ---------------------------------------------------

async function EndorsementsSection({ did }: { did: string }) {
  const [endorsements, follows] = await Promise.all([getEndorsements(did), getFollowCounts(did)]);
  return (
    <Section
      title="Endorsements and followers"
      description="Received, given, who follows you and who you follow."
    >
      <StatRow
        label="Endorsements and followers"
        stats={[
          {
            label: byCount(
              endorsements.receivedCount,
              "Endorsement received",
              "Endorsements received",
            ),
            value: endorsements.receivedCount,
            href: `${workspaceHref(did)}/endorsements`,
          },
          {
            label: byCount(endorsements.given, "Endorsement given", "Endorsements given"),
            value: endorsements.given,
            href: `${workspaceHref(did)}/endorsements/given`,
          },
          {
            label: byCount(follows.followers, "Follower", "Followers"),
            value: follows.followers,
            href: `${workspaceHref(did)}/followers`,
          },
          {
            label: "Following",
            value: follows.following,
            href: `${workspaceHref(did)}/followers/following`,
          },
        ]}
      />
      {endorsements.latestReceived.length > 0 && (
        <div className="overview-list">
          <ListLabel>Latest endorsements received</ListLabel>
          <ul className="overview-rows divided">
            {endorsements.latestReceived.map((endorsement) => (
              <li key={endorsement.uri} className="overview-row-dated">
                <ActorRow
                  actor={endorsement.issuer}
                  href={actorHref(endorsement.issuer)}
                  secondary={endorsementLine(endorsement)}
                />
                {endorsement.createdAt && (
                  <span className="overview-row-date">{endorsement.createdAt}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// Identity and ID ------------------------------------------------------------

/** The first non-empty line of a bio, so the box stays short. */
function firstLine(text: string | null): string | null {
  return (
    text
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

async function IdentityBox({ did }: { did: string }) {
  return <IdentityView did={did} actor={await getActor(did)} />;
}

function IdentityView({ did, actor }: { did: string; actor: ActorDetail | null }) {
  const handle = actor?.handle ?? null;
  // An account the index doesn't know yet: by its DID.
  const account = actor ?? { did, handle, displayName: did, avatarUrl: null };
  const bio = firstLine(actor?.description ?? null);
  const website = actor?.website ?? null;
  const isOrganization = actor?.isOrganization ?? false;
  const idTitleId = useId();

  return (
    <>
      <div className="overview-identity">
        <ActorAvatar actor={account} size="lg" className="overview-avatar" />
        <div className="overview-identity-text">
          <Heading level={2} size="heading">
            <ActorLink actor={account} avatar={false} />
          </Heading>
          {bio ? (
            <Text size="body-sm" tone="muted" className="overview-bio" dir="auto">
              {bio}
            </Text>
          ) : (
            <Text size="body-sm" tone="muted">
              <ActorHandle actor={account} />
            </Text>
          )}
          {website && (
            <a
              href={website}
              className="overview-website"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Link2 size={16} aria-hidden />
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
      <section aria-labelledby={idTitleId} className="overview-id">
        <div className="section-heading">
          <Heading level={2} size="heading" id={idTitleId}>
            ID
          </Heading>
          <Text tone="muted">
            {isOrganization
              ? "Identifies this group's account in every app."
              : "Identifies your account in every app."}
          </Text>
        </div>
        <dl className="overview-id-list divided">
          {handle && (
            <div className="overview-id-item">
              <dt>Handle</dt>
              <dd>
                <CopyableId
                  value={handle}
                  displayValue={`@${handle}`}
                  label="Handle"
                  className="overview-id-field"
                />
              </dd>
            </div>
          )}
          <div className="overview-id-item">
            <dt>Permanent ID</dt>
            <dd>
              <CopyableId
                value={did}
                truncateTo={10}
                label="Permanent ID"
                className="overview-id-field"
              />
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

// Organizations --------------------------------------------------------------

/** Your groups (organizations on CGS), as staging names them, with New group. */
export function OrganizationsSection({
  organizations,
  pdsDomain,
}: {
  /** Or why they can't be shown: memberships unreadable, or the sign-in expired. */
  organizations: Organization[] | "unavailable" | "expired";
  pdsDomain: string;
}) {
  return (
    <Section title="Your groups" action={<NewGroupDialog pdsDomain={pdsDomain} />}>
      {organizations === "unavailable" || organizations === "expired" ? (
        <Text size="body-sm" tone="muted">
          {organizations === "expired"
            ? "Sign in again to see your groups."
            : "Your groups can't be loaded right now."}
        </Text>
      ) : organizations.length === 0 ? (
        <Text size="body-sm" tone="muted">
          You don't belong to any group yet.
        </Text>
      ) : (
        <ul className="overview-rows divided">
          {organizations.map((organization) => (
            <li key={organization.did}>
              <ActorRow
                actor={organization}
                href={actorHref(organization)}
                secondary={[
                  organization.roleLabel,
                  organization.handle && `@${organization.handle}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export type GroupMemberView = {
  actor: ActorCard;
  role: string;
  roleLabel: string;
};

/** Members of an organization workspace, with CGS team management for admins & owners. */
export function GroupMembersSection({
  groupDid,
  members,
  viewerRole,
}: {
  groupDid: string;
  members: GroupMemberView[] | "unavailable" | "expired";
  viewerRole: string | null;
}) {
  const isAdmin = viewerRole === "admin" || viewerRole === "owner";
  const isOwner = viewerRole === "owner";
  return (
    <Section title="Members" action={isAdmin ? <AddMemberDialog groupDid={groupDid} /> : undefined}>
      {members === "unavailable" || members === "expired" ? (
        <Text size="body-sm" tone="muted">
          {members === "expired"
            ? "Sign in again to see this group's members."
            : "Members can't be loaded right now."}
        </Text>
      ) : members.length === 0 ? (
        <Text size="body-sm" tone="muted">
          No members listed.
        </Text>
      ) : (
        <ul className="overview-rows divided">
          {members.map((member) => (
            <li key={member.actor.did} className="overview-row-dated">
              <ActorRow
                actor={member.actor}
                href={actorHref(member.actor)}
                secondary={[member.roleLabel, member.actor.handle && `@${member.actor.handle}`]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {member.role !== "owner" && (
                <MemberActions
                  groupDid={groupDid}
                  memberDid={member.actor.did}
                  memberName={nameOf(member.actor)}
                  role={member.role}
                  canChangeRole={isOwner}
                  canRemove={isAdmin}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// Apps -----------------------------------------------------------------------

function AppsSection() {
  return (
    <Section title="Apps" description="Sign in to each of these with your Certified account.">
      <ul className="overview-rows divided">
        {APPS.map((app) => (
          <li key={app.name}>
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="overview-row overview-row-link"
            >
              <span className="overview-thumb">
                <Image src={app.logo} alt="" width={32} height={32} />
              </span>
              <span className="overview-row-text">
                <span className="overview-row-title">{app.name}</span>
                <span className="overview-row-meta">{app.tagline}</span>
              </span>
              <ArrowUpRight size={16} aria-hidden className="overview-row-arrow" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      <Link href="/apps" className="overview-see-all">
        All apps
      </Link>
    </Section>
  );
}
