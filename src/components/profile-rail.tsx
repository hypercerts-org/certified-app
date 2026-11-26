// A profile's right column, the same on every tab (the tabs switch only the
// left one): the account's figures, each a link to its tab; where it is; its
// identifiers. Like the intro beside a Facebook profile's feed.

import { Card, CopyableId, Heading, Skeleton } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { skeletonSlots } from "@/components/cards";
import { LocationCard } from "@/components/location-card";
import { type Stat, StatRow } from "@/components/stat-row";
import {
  getActorPlace,
  getBadges,
  getFundingSummary,
  getIssuedBadges,
  hasFunding,
  listEndorsements,
  listLists,
} from "@/lib/hypercerts/queries";
import type { ActorDetail } from "@/lib/hypercerts/views";
import { nameOf } from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";

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

/** Where an organization is: its place takes a geocoder, so it comes on its own. */
async function Location({ actor }: { actor: ActorDetail }) {
  const place = await getActorPlace(actor.did);
  return place ? (
    <LocationCard place={place} who={nameOf(actor)} imageUrl={actor.avatarUrl} />
  ) : null;
}

/** The handle, once it is checked both ways (its DID document and its domain). */
async function HandleFact({ did }: { did: string }) {
  const handle = await getHandle(did);
  if (!handle) return null;
  return (
    <div className="fact">
      <dt>Handle</dt>
      <dd>
        <CopyableId value={handle} displayValue={`@${handle}`} label="Handle" wrap />
      </dd>
    </div>
  );
}

/**
 * From the account as the API has it (getActorCore); the place and the
 * handle need outside lookups and stream in.
 */
export function ProfileRail({ actor, base }: { actor: ActorDetail; base: string }) {
  const { did } = actor;
  return (
    <>
      <Suspense fallback={null}>
        <Figures did={did} base={base} />
      </Suspense>
      {actor.isOrganization && (
        <Suspense fallback={null}>
          <Location actor={actor} />
        </Suspense>
      )}
      <Card variant="panel" className="overview-box rail-card">
        <Heading level={2} size="heading">
          Account
        </Heading>
        <dl className="facts">
          {/* Only when it differs from the name the profile shows. */}
          {actor.legalName && actor.legalName.toLowerCase() !== nameOf(actor).toLowerCase() && (
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
          <Suspense fallback={null}>
            <HandleFact did={did} />
          </Suspense>
          <div className="fact">
            <dt>Permanent ID</dt>
            <dd>
              <CopyableId value={did} label="Permanent ID" wrap />
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
