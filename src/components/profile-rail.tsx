// A profile's right column, the same on every tab (the tabs switch only the
// left one): the account's figures, each a link to its tab; where it is; its
// identifiers. Like the intro beside a Facebook profile's feed.

import { Card, CopyableId, Heading, Skeleton } from "@hypercerts-org/ui-react";
import { MapPin } from "lucide-react";
import { Suspense } from "react";
import { skeletonSlots } from "@/components/cards";
import { LocationMap } from "@/components/location-map";
import { type Stat, StatRow } from "@/components/stat-row";
import {
  getBadges,
  getFundingSummary,
  getIssuedBadges,
  hasFunding,
  listEndorsements,
  listLists,
} from "@/lib/hypercerts/queries";
import type { ActorDetail } from "@/lib/hypercerts/views";

const numberFormat = new Intl.NumberFormat("en");
const countLabel = (count: number, more: boolean) =>
  `${numberFormat.format(count)}${more ? "+" : ""}`;

/**
 * The account's figures: the accounts it endorses, the badges it holds and
 * issues, its lists, and (on its own, as adding it up can take a while) the
 * funding it received. Only those it has; no card when it has none.
 */
async function Figures({ did, base }: { did: string; base: string }) {
  const [given, { accepted }, issued, { lists, more: moreLists }] = await Promise.all([
    listEndorsements(did, "given"),
    getBadges(did),
    getIssuedBadges(did),
    listLists(did),
  ]);
  const endorsed = new Set(given.rows.map((row) => row.actor.did)).size;
  const stats: Stat[] = [];
  if (endorsed > 0) {
    stats.push({
      label: "Endorses",
      value: countLabel(endorsed, given.more),
      href: `${base}/endorsements/given`,
    });
  }
  if (accepted.length > 0) {
    stats.push({ label: "Badges", value: accepted.length, href: `${base}/badges` });
  }
  if (issued.badges.length > 0) {
    stats.push({
      label: "Badges issued",
      value: countLabel(issued.badges.length, issued.more),
      href: `${base}/badges/issued`,
    });
  }
  if (lists.length > 0) {
    stats.push({
      label: "Lists",
      value: countLabel(lists.length, moreLists),
      href: `${base}/lists`,
    });
  }
  const { received } = await hasFunding(did);
  if (stats.length === 0 && !received) return null;
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        In numbers
      </Heading>
      <div className="rail-figures">
        {stats.length > 0 && <StatRow label="In numbers" stats={stats} />}
        {received && (
          <Suspense fallback={null}>
            <Received did={did} base={base} />
          </Suspense>
        )}
      </div>
    </Card>
  );
}

async function Received({ did, base }: { did: string; base: string }) {
  const summary = await getFundingSummary({ to: did });
  const [main] = summary.totals;
  if (!main) return null;
  return (
    <StatRow
      label="Funding"
      stats={[
        {
          label: "Received",
          value: `${main.amount}${summary.capped ? "+" : ""}`,
          href: `${base}/funding`,
        },
      ]}
    />
  );
}

export function ProfileRail({ actor, base }: { actor: ActorDetail; base: string }) {
  const { did, handle } = actor;
  return (
    <>
      <Suspense fallback={null}>
        <Figures did={did} base={base} />
      </Suspense>
      {actor.place && (
        <Card variant="panel" className="overview-box rail-card">
          <Heading level={2} size="heading">
            Location
          </Heading>
          <div className="location">
            {actor.place.point && (
              <LocationMap
                point={actor.place.point}
                label={`${actor.displayName}, ${actor.place.short}`}
                imageUrl={actor.avatarUrl}
              />
            )}
            <p className="location-name">
              <MapPin size={16} aria-hidden />
              <span dir="auto">{actor.place.name}</span>
            </p>
          </div>
        </Card>
      )}
      <Card variant="panel" className="overview-box rail-card">
        <Heading level={2} size="heading">
          Account
        </Heading>
        <dl className="facts">
          {/* Only when it differs from the name the profile shows. */}
          {actor.legalName && actor.legalName.toLowerCase() !== actor.displayName.toLowerCase() && (
            <div className="fact">
              <dt>Legal name</dt>
              <dd dir="auto">{actor.legalName}</dd>
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
    </>
  );
}

/** The column on its way: a card's worth of room. */
export function ProfileRailSkeleton() {
  return (
    <>
      {skeletonSlots(1).map((slot) => (
        <Skeleton key={slot} variant="box" className="skeleton-rail" />
      ))}
    </>
  );
}
