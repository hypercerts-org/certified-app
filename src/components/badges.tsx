// Badges awarded to an account (queries.ts, getBadges) as rows with every
// detail on its profile's Badges tab; badges awarded to a record (a project,
// an activity) on its Badges tab; and an organization's projects' badges
// as the projects' rows, each with its badge's tile at the end. A
// badge shows as its issuer defined it (icon, title, type) and as awarded
// (who, when, until when, the note). An expired badge stays, marked and
// dimmed, after the ones in force.

import { Badge, IdentityLink, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Award, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { actorHref, identityOf } from "@/components/actor";
import { badgeHref, skeletonSlots } from "@/components/cards";
import { Empty } from "@/components/empty";
import { IntentLink } from "@/components/intent-link";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { ProjectRow, RecordRowSkeleton } from "@/components/records";
import {
  getBadges,
  getIssuedBadges,
  getProjectBadges,
  getRecordBadges,
  type IssuedBadge,
  type ProjectBadge,
} from "@/lib/hypercerts/queries";
import type { BadgeCard } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

/** A badge's icon, or a generic one. `large` on the badge's own page. */
export function BadgeIcon({
  badge,
  large = false,
}: {
  badge: Pick<BadgeCard, "iconUrl">;
  large?: boolean;
}) {
  return (
    <span className={large ? "badge-icon badge-icon-large" : "badge-icon"}>
      {badge.iconUrl ? (
        // biome-ignore lint/performance/noImgElement: Bluesky's CDN, already sized
        <img src={badge.iconUrl} alt="" loading="lazy" />
      ) : (
        <Award size={20} strokeWidth={1.5} aria-hidden />
      )}
    </span>
  );
}

function Issuer({ badge }: { badge: BadgeCard }) {
  return (
    <IdentityLink {...identityOf(badge.issuer)} href={actorHref(badge.issuer)} avatar={false} />
  );
}

/** One badge as a tile: icon, title, and who issued it. */
function BadgeTile({ badge }: { badge: BadgeCard }) {
  return (
    <span className="badge-tile" data-expired={badge.expired || undefined}>
      <BadgeIcon badge={badge} />
      <span className="badge-tile-text">
        <IntentLink href={badgeHref(badge)} className="badge-title" dir="auto">
          {badge.title}
        </IntentLink>
        <span className="badge-meta">
          {badge.expired ? "Expired · " : ""}
          <Issuer badge={badge} />
        </span>
      </span>
    </span>
  );
}

/** A record's badges (a project's, an activity's), as its Badges tab lists them. */
export async function RecordBadgeList({ uri }: { uri: string }) {
  // The tab shows only with badges; an old link can still land here.
  return <BadgeList badges={await getRecordBadges(uri)} empty="No badges yet" />;
}

/**
 * The badges an organization's projects received: each the project's row
 * (the whole row leads to the project), with the badge's tile at its end.
 */
export function ProjectBadgeList({ badges }: { badges: ProjectBadge[] }) {
  if (badges.length === 0) return <Empty icon={Award} title="No badges for projects yet" />;
  return (
    <ul className="list-items divided">
      {badges.map((badge) => (
        <li key={badge.uri} className="list-item">
          <ProjectRow
            project={badge.project}
            className="project-badge-row"
            end={<BadgeTile badge={badge} />}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * A Badges tab's list: each badge with its type, issuer, dates, note and
 * link. The workspace adds the award's state (`state`), and its Awarded tab
 * says who each went to instead of who it came from (`who`).
 */
export function BadgeList<T extends BadgeCard>({
  badges,
  empty,
  emptyDescription,
  actions,
  state,
  who,
}: {
  badges: T[];
  /** The empty list's title ("No badges accepted yet"), and in the workspace a line on how it fills. */
  empty: string;
  emptyDescription?: string;
  /** Buttons at a row's end: the workspace's responses. */
  actions?: (badge: T) => ReactNode;
  /** The award's state as a tag ("Awaiting your response"), or null for none. */
  state?: (badge: T) => string | null;
  /** The meta line's start; "From" its issuer otherwise. */
  who?: (badge: T) => ReactNode;
}) {
  if (badges.length === 0)
    return <Empty icon={Award} title={empty} description={emptyDescription} />;
  return (
    <ul className="badge-list divided">
      {badges.map((badge) => (
        <li key={badge.uri} className="badge-row" data-expired={badge.expired || undefined}>
          <BadgeIcon badge={badge} />
          <div className="badge-row-text">
            <p className="badge-row-head">
              <IntentLink href={badgeHref(badge)} className="badge-title" dir="auto">
                {badge.title}
              </IntentLink>
              {badge.type && <span className="badge-type">{badge.type}</span>}
              {badge.expired && <span className="badge-type">Expired</span>}
              {state?.(badge) && <Badge variant="tag">{state(badge)}</Badge>}
            </p>
            <p className="badge-meta">
              {who ? (
                who(badge)
              ) : (
                <>
                  From <Issuer badge={badge} />
                </>
              )}
              {badge.awarded && ` · ${badge.awarded}`}
              {badge.validUntil &&
                (badge.expired
                  ? ` · Expired ${badge.validUntil}`
                  : ` · Valid until ${badge.validUntil}`)}
            </p>
            {(badge.note ?? badge.description) && (
              <p className="badge-note" dir="auto">
                {badge.note ?? badge.description}
              </p>
            )}
            {badge.url && (
              <a href={badge.url} target="_blank" rel="noopener noreferrer" className="badge-link">
                {badge.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "")}
                <ExternalLink size={14} aria-hidden />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            )}
          </div>
          {actions && <div className="badge-row-actions">{actions(badge)}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Badge rows on their way. */
export function BadgeListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="badge-list divided" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="badge-row">
          <Skeleton variant="box" className="badge-icon" />
          <Skeleton variant="text" lines={2} className="badge-row-text" />
        </div>
      ))}
    </div>
  );
}

const numberFormat = new Intl.NumberFormat("en");
const holdersLabel = (n: number) => `${numberFormat.format(n)} ${n === 1 ? "holder" : "holders"}`;

/** The badges an account defined, as rows: with their description. */
export function IssuedBadgeList({
  badges,
  actions,
  empty = "No badges issued yet",
  emptyDescription,
}: {
  badges: IssuedBadge[];
  /** Buttons at a row's end (such as Award in the workspace). */
  actions?: (badge: IssuedBadge) => ReactNode;
  /** The empty list's title, and in the workspace a line on how it fills. */
  empty?: string;
  emptyDescription?: string;
}) {
  if (badges.length === 0)
    return <Empty icon={Award} title={empty} description={emptyDescription} />;
  return (
    <ul className="badge-list divided">
      {badges.map((badge) => (
        <li key={badge.uri} className="badge-row">
          <BadgeIcon badge={badge} />
          <div className="badge-row-text">
            <p className="badge-row-head">
              <IntentLink href={badgeHref(badge)} className="badge-title" dir="auto">
                {badge.title}
              </IntentLink>
              {badge.type && <span className="badge-type">{badge.type}</span>}
            </p>
            <p className="badge-meta">{holdersLabel(badge.holders)}</p>
            {badge.description && (
              <p className="badge-note" dir="auto">
                {badge.description}
              </p>
            )}
          </div>
          {actions && <div className="badge-row-actions">{actions(badge)}</div>}
        </li>
      ))}
    </ul>
  );
}

type Which = "accepted" | "awaiting" | "projects" | "issued";

const BADGE_TABS: Record<Which, { label: string; path: string }> = {
  accepted: { label: "Accepted", path: "/badges" },
  awaiting: { label: "Awaiting response", path: "/badges/awaiting" },
  projects: { label: "For projects", path: "/badges/projects" },
  issued: { label: "Issued", path: "/badges/issued" },
};

/**
 * A profile's Badges tab, `which` of its lists: the badges the account
 * accepted, those awaiting its response, those its projects received, and
 * those it defined for others.
 */
export async function ProfileBadges({
  params,
  which,
}: {
  params: Promise<{ actor: string }>;
  which: Which;
}) {
  const { actor, base } = await profileActor(params, BADGE_TABS[which].path);
  const [received, issued, projects] = await Promise.all([
    getBadges(actor.did),
    getIssuedBadges(actor.did),
    getProjectBadges(actor.did),
  ]);
  const counts: Record<Which, number> = {
    accepted: received.accepted.length,
    awaiting: received.awaiting.length,
    projects: projects.badges.length,
    issued: issued.badges.length,
  };
  // "For projects" only for an account whose projects hold a badge.
  const shown = (Object.keys(BADGE_TABS) as Which[]).filter(
    (key) => key !== "projects" || which === "projects" || counts.projects > 0,
  );
  const more =
    which === "issued" ? issued.more : which === "projects" ? projects.more : received.more;
  return (
    <div className="profile-list-page">
      <ProfileTabs
        label="Badges"
        variant="segmented"
        tabs={shown.map((key) => ({
          label: BADGE_TABS[key].label,
          href: `${base}${BADGE_TABS[key].path}`,
          count: counts[key] > 0 ? String(counts[key]) : undefined,
        }))}
      />
      {which === "issued" ? (
        <IssuedBadgeList badges={issued.badges} />
      ) : which === "projects" ? (
        <ProjectBadgeList badges={projects.badges} />
      ) : (
        <BadgeList
          badges={received[which]}
          empty={which === "accepted" ? "No badges accepted yet" : "No badges awaiting a response"}
        />
      )}
      {more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {counts[which]}.
        </Text>
      )}
    </div>
  );
}

/** A Badges tab on its way: its lists' switch, then rows. */
export function ProfileBadgesSkeleton({ which }: { which: Which }) {
  return (
    <div className="profile-list-page">
      <SegmentedLinksSkeleton
        labels={(Object.keys(BADGE_TABS) as Which[])
          .filter((key) => key !== "projects" || which === "projects")
          .map((key) => BADGE_TABS[key].label)}
        current={BADGE_TABS[which].label}
      />
      {which === "projects" ? <ProjectBadgeListSkeleton /> : <BadgeListSkeleton />}
    </div>
  );
}

/** Project badge rows on their way. */
function ProjectBadgeListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list-items divided" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="list-item">
          <RecordRowSkeleton />
        </div>
      ))}
    </div>
  );
}
