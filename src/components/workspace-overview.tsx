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
  Avatar,
  Button,
  Card,
  CopyableId,
  EmptyState,
  Heading,
  IdentityRow,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react";
import { ArrowUpRight, FolderGit2, Plus, Search, SquareCheckBig } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, Suspense, useId } from "react";
import { actorHref, projectHref } from "@/components/cards";
import { APPS } from "@/lib/apps";
import {
  type Count,
  getActor,
  getEndorsements,
  getFollowCounts,
  getRecordCounts,
  listLatestRecords,
} from "@/lib/hypercerts/queries";
import type { ActorDetail, RecentRecord } from "@/lib/hypercerts/views";
import { didOf, rkeyOf } from "@/lib/hypercerts/views";
import type { Organization } from "@/lib/organizations";

const LATEST_RECORDS = 4;
const LATEST_ENDORSEMENTS = 3;

export function WorkspaceOverview({
  did,
  canEdit,
  organizations,
}: {
  did: string;
  /** Whether the viewer may edit the account's profile. */
  canEdit: boolean;
  /** Your organizations, on your own workspace; null on an organization's. */
  organizations: ReactNode | null;
}) {
  return (
    <>
      <h1 className="workspace-title">Overview</h1>
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
              <IdentityBox did={did} canEdit={canEdit} />
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
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="overview-section" aria-labelledby={titleId}>
      <div className="overview-section-header">
        <Heading level={2} size="heading" id={titleId}>
          {title}
        </Heading>
        {description && (
          <Text size="body-sm" tone="muted">
            {description}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}

// Skeletons, shaped like the sections, so nothing moves when they arrive.

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overview-rows" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
        <div key={i} className="overview-row">
          <Skeleton variant="box" className="overview-thumb" />
          <Skeleton variant="text" lines={2} className="overview-row-text" />
        </div>
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
    <Section title="Your organizations">
      <RowsSkeleton rows={2} />
    </Section>
  );
}

/** The whole overview, while the page works out whose workspace it is. */
export function OverviewSkeleton() {
  return (
    <>
      <h1 className="workspace-title">Overview</h1>
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

const numberFormat = new Intl.NumberFormat("en");
const formatCount = (count: Count | number) =>
  typeof count === "number"
    ? numberFormat.format(count)
    : `${numberFormat.format(count.value)}${count.capped ? "+" : ""}`;

type Stat = { label: string; value: Count | number; href?: string };

/** Counts in a row, each a large number over its label. */
function StatRow({ label, stats }: { label: string; stats: Stat[] }) {
  return (
    <ul className="stat-row" aria-label={label}>
      {stats.map((stat) => {
        const content = (
          <>
            <span className="stat-value">{formatCount(stat.value)}</span>
            <span className="stat-label">{stat.label}</span>
          </>
        );
        return (
          <li key={stat.label}>
            {stat.href ? (
              <Link prefetch href={stat.href} className="stat stat-link">
                {content}
              </Link>
            ) : (
              <span className="stat">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ListLabel({ children }: { children: ReactNode }) {
  return <h3 className="overview-list-label">{children}</h3>;
}

// Records --------------------------------------------------------------------

async function RecordsSection({ did }: { did: string }) {
  const [counts, latest, actor] = await Promise.all([
    getRecordCounts(did),
    listLatestRecords(did, LATEST_RECORDS),
    getActor(did),
  ]);
  const profile = actorHref({ did, handle: actor?.handle ?? null });
  const empty =
    latest.length === 0 &&
    counts.activities.value === 0 &&
    counts.projects.value === 0 &&
    counts.lists.value === 0;

  return (
    <Section title="Your records" description="What you have published, here or in other apps.">
      {empty ? (
        <EmptyState
          title="No records yet"
          description="Activities and projects you publish, here or in other apps, show up here."
          action={
            // New activity and New project are placeholders until the
            // Hypercerts SDK ships those writes.
            <div className="empty-actions">
              <Button variant="primary" size="sm" disabled title="Coming soon">
                <Plus size={16} aria-hidden />
                New activity
              </Button>
              <Button variant="secondary" size="sm" disabled title="Coming soon">
                <Plus size={16} aria-hidden />
                New project
              </Button>
              <Button href="/explore" variant="secondary" size="sm">
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
                href: profile,
              },
              {
                label: byCount(counts.projects.value, "Project", "Projects"),
                value: counts.projects,
                href: profile,
              },
              { label: byCount(counts.lists.value, "List", "Lists"), value: counts.lists },
            ]}
          />
          {latest.length > 0 && (
            <div className="overview-list">
              <ListLabel>Latest</ListLabel>
              <ul className="overview-rows">
                {latest.map((record) => (
                  <li key={record.uri}>
                    <RecordRow record={record} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** A latest record: thumbnail, title, kind and date. Projects link to their page. */
function RecordRow({ record }: { record: RecentRecord }) {
  const content = (
    <>
      <span className="overview-thumb">
        {record.imageUrl ? (
          // Indexed images come from many hosts: no next/image optimization.
          // biome-ignore lint/performance/noImgElement: arbitrary remote hosts
          <img src={record.imageUrl} alt="" width={32} height={32} loading="lazy" />
        ) : record.kind === "Project" ? (
          <FolderGit2 size={16} aria-hidden />
        ) : (
          <SquareCheckBig size={16} aria-hidden />
        )}
      </span>
      <span className="overview-row-text">
        <span className="overview-row-title" dir="auto">
          {record.title}
        </span>
        <span className="overview-row-meta">
          {record.kind}
          {record.date && ` · ${record.date}`}
        </span>
      </span>
    </>
  );
  // Activities have no page of their own yet.
  return record.kind === "Project" ? (
    <Link
      prefetch
      href={projectHref({ authorDid: didOf(record.uri), rkey: rkeyOf(record.uri) })}
      className="overview-row overview-row-link"
    >
      {content}
    </Link>
  ) : (
    <div className="overview-row">{content}</div>
  );
}

// Endorsements and followers ---------------------------------------------------

async function EndorsementsSection({ did }: { did: string }) {
  const [endorsements, follows] = await Promise.all([
    getEndorsements(did, LATEST_ENDORSEMENTS),
    getFollowCounts(did),
  ]);
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
          },
          {
            label: byCount(endorsements.given, "Endorsement given", "Endorsements given"),
            value: endorsements.given,
          },
          {
            label: byCount(follows.followers, "Follower", "Followers"),
            value: follows.followers,
          },
          { label: "Following", value: follows.following },
        ]}
      />
      {endorsements.latestReceived.length > 0 && (
        <div className="overview-list">
          <ListLabel>Latest received</ListLabel>
          <ul className="overview-rows">
            {endorsements.latestReceived.map((endorsement) => (
              <li key={endorsement.uri}>
                <IdentityRow
                  size="sm"
                  name={endorsement.issuer.displayName}
                  avatarSrc={endorsement.issuer.avatarUrl}
                  href={actorHref(endorsement.issuer)}
                  secondary={
                    [endorsement.note, endorsement.createdAt].filter(Boolean).join(" · ") ||
                    undefined
                  }
                />
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

async function IdentityBox({ did, canEdit }: { did: string; canEdit: boolean }) {
  return <IdentityView did={did} canEdit={canEdit} actor={await getActor(did)} />;
}

function IdentityView({
  did,
  canEdit,
  actor,
}: {
  did: string;
  canEdit: boolean;
  actor: ActorDetail | null;
}) {
  const handle = actor?.handle ?? null;
  const name = actor?.displayName ?? (handle ? `@${handle}` : did);
  const bio = firstLine(actor?.description ?? null);
  const website = actor?.website ?? null;
  const isOrganization = actor?.isOrganization ?? false;
  const idTitleId = useId();

  return (
    <>
      <div className="overview-identity">
        <Avatar name={name.replace(/^@/, "")} src={actor?.avatarUrl} size="lg" />
        <div className="overview-identity-text">
          <Heading level={2} size="heading">
            <Link
              prefetch
              href={actorHref({ did, handle })}
              className="overview-identity-name"
              dir="auto"
            >
              {name}
            </Link>
          </Heading>
          {bio ? (
            <Text size="body-sm" tone="muted" className="overview-bio" dir="auto">
              {bio}
            </Text>
          ) : (
            handle &&
            actor?.displayName && (
              <Text size="body-sm" tone="muted">
                @{handle}
              </Text>
            )
          )}
          {website && (
            <a
              href={website}
              className="overview-website"
              target="_blank"
              rel="noopener noreferrer"
            >
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
          {canEdit && (
            <Link href={`${actorHref(did)}/edit`} className="overview-edit">
              Edit profile
            </Link>
          )}
        </div>
      </div>
      <section aria-labelledby={idTitleId} className="overview-id">
        <div className="overview-section-header">
          <Heading level={2} size="heading" id={idTitleId}>
            ID
          </Heading>
          <Text size="body-sm" tone="muted">
            {isOrganization
              ? "Identifies this organization's account in every app."
              : "Identifies your account in every app."}
          </Text>
        </div>
        <dl className="overview-id-list">
          {handle && (
            <div className="overview-id-item">
              <dt>Handle</dt>
              <dd>
                <CopyableId value={handle} displayValue={`@${handle}`} label="Handle" />
              </dd>
            </div>
          )}
          <div className="overview-id-item">
            <dt>Permanent ID</dt>
            <dd>
              <CopyableId value={did} label="Permanent ID" />
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

// Organizations --------------------------------------------------------------

export function OrganizationsSection({ organizations }: { organizations: Organization[] }) {
  return (
    <Section title="Your organizations">
      {organizations.length === 0 ? (
        <Text size="body-sm" tone="muted">
          You don't belong to any organization yet.
        </Text>
      ) : (
        <ul className="overview-rows">
          {organizations.map((organization) => (
            <li key={organization.did}>
              <IdentityRow
                size="sm"
                name={organization.name}
                avatarSrc={organization.avatarUrl}
                href={actorHref(organization)}
                secondary={organization.roleLabel}
              />
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
      <ul className="overview-rows">
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
