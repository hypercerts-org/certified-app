// Badges awarded to an account (queries.ts, getBadges): as tiles on the
// profile's Overview, and as rows with every detail on its Badges tab. A
// badge shows as its issuer defined it (icon, title, type) and as awarded
// (who, when, until when, the note). An expired badge stays, marked and
// dimmed, after the ones in force.

import { Skeleton, Text } from "@hypercerts-org/ui-react";
import { Award, ExternalLink } from "lucide-react";
import { actorHref, skeletonSlots } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import { ProfileTabs, SegmentedLinksSkeleton } from "@/components/profile-actions";
import { getBadges } from "@/lib/hypercerts/queries";
import type { BadgeCard } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

function BadgeIcon({ badge }: { badge: BadgeCard }) {
  return (
    <span className="badge-icon">
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
    <IntentLink href={actorHref(badge.issuer)} className="badge-issuer" dir="auto">
      {badge.issuer.displayName}
    </IntentLink>
  );
}

/** The Overview's badges: icon, title and issuer, a few across. */
export function BadgeTiles({ badges }: { badges: BadgeCard[] }) {
  return (
    <ul className="badge-tiles">
      {badges.map((badge) => (
        <li key={badge.uri} className="badge-tile" data-expired={badge.expired || undefined}>
          <BadgeIcon badge={badge} />
          <span className="badge-tile-text">
            <span className="badge-title" dir="auto">
              {badge.title}
            </span>
            <span className="badge-meta">
              {badge.expired ? "Expired · " : ""}
              <Issuer badge={badge} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A Badges tab's list: each badge with its type, issuer, dates, note and link. */
export function BadgeList({ badges, empty }: { badges: BadgeCard[]; empty: string }) {
  if (badges.length === 0) return <Text tone="muted">{empty}</Text>;
  return (
    <ul className="badge-list">
      {badges.map((badge) => (
        <li key={badge.uri} className="badge-row" data-expired={badge.expired || undefined}>
          <BadgeIcon badge={badge} />
          <div className="badge-row-text">
            <p className="badge-row-head">
              <span className="badge-title" dir="auto">
                {badge.title}
              </span>
              {badge.type && <span className="badge-type">{badge.type}</span>}
              {badge.expired && <span className="badge-type">Expired</span>}
            </p>
            <p className="badge-meta">
              From <Issuer badge={badge} />
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
        </li>
      ))}
    </ul>
  );
}

/** Badge tiles on their way. */
export function BadgeTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="badge-tiles" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <div key={slot} className="badge-tile">
          <Skeleton variant="box" className="badge-icon" />
          <Skeleton variant="text" lines={2} className="badge-tile-text" />
        </div>
      ))}
    </div>
  );
}

/** Badge rows on their way. */
export function BadgeListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="badge-list" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="badge-row">
          <Skeleton variant="box" className="badge-icon" />
          <Skeleton variant="text" lines={2} className="badge-row-text" />
        </div>
      ))}
    </div>
  );
}

const BADGE_TABS = ["Accepted", "Awaiting response"];

/**
 * A profile's Badges tab, `which` of its two lists: the badges the account
 * accepted, or those awaiting its response.
 */
export async function ProfileBadges({
  params,
  which,
}: {
  params: Promise<{ actor: string }>;
  which: "accepted" | "awaiting";
}) {
  const path = which === "accepted" ? "/badges" : "/badges/awaiting";
  const { actor, base } = await profileActor(params, path);
  const badges = await getBadges(actor.did);
  return (
    <div className="profile-list-page">
      <ProfileTabs
        label="Badges"
        variant="segmented"
        tabs={[
          { label: "Accepted", href: `${base}/badges`, count: count(badges.accepted.length) },
          {
            label: "Awaiting response",
            href: `${base}/badges/awaiting`,
            count: count(badges.awaiting.length),
          },
        ]}
      />
      <BadgeList
        badges={badges[which]}
        empty={
          which === "accepted"
            ? "No accepted badges yet."
            : "No badges are awaiting this account's response."
        }
      />
      {badges.more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {badges[which].length}.
        </Text>
      )}
    </div>
  );
}

const count = (n: number) => (n > 0 ? String(n) : undefined);

/** A Badges tab on its way: its two lists' switch, then rows. */
export function ProfileBadgesSkeleton({ which }: { which: "accepted" | "awaiting" }) {
  return (
    <div className="profile-list-page">
      <SegmentedLinksSkeleton
        labels={BADGE_TABS}
        current={which === "accepted" ? "Accepted" : "Awaiting response"}
      />
      <BadgeListSkeleton />
    </div>
  );
}
