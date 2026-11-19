import { Card, CopyableId, Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import { ChevronRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { skeletonSlots } from "@/components/cards";
import { LocationMap } from "@/components/location-map";
import { ProfileFeed, ProfileFeedSkeleton } from "@/components/profile-feed";
import { type Stat, StatRow } from "@/components/stat-row";
import {
  getActor,
  getBadges,
  getFundingSummary,
  getIssuedBadges,
  getProfileFeed,
  hasFunding,
  listEndorsements,
  listLists,
} from "@/lib/hypercerts/queries";
import type { ActorCard, PersonRow } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";

// The profile's Overview: one reading column, and the facts beside it. The
// column opens with the account's figures, each a link to its tab (whom it
// endorses, its badges, its lists, the funding it received), then About (an
// organization's long description) and its feed: what it did, newest first,
// its projects and activities among it. Beside it: where it is, and its
// identifiers. Who endorsed the account and who follows it are in the
// header, so nothing here repeats them.

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
        <Heading level={2} size="heading">
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

/** Each account once, newest first. */
function uniqueActors(rows: PersonRow[]): { actor: ActorCard; row: PersonRow }[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => !seen.has(row.actor.did) && seen.add(row.actor.did))
    .map((row) => ({ actor: row.actor, row }));
}

const countLabel = (count: number, more: boolean) =>
  `${numberFormat.format(count)}${more ? "+" : ""}`;

/**
 * The account's figures, each a link to its tab: the accounts it endorses,
 * the badges it holds and issues, its lists. Only those it has.
 */
async function Figures({ did, base }: { did: string; base: string }) {
  const [given, { accepted }, issued, { lists, more: moreLists }] = await Promise.all([
    listEndorsements(did, "given"),
    getBadges(did),
    getIssuedBadges(did),
    listLists(did),
  ]);
  const endorsed = uniqueActors(given.rows).length;
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
  if (stats.length === 0) return null;
  return <StatRow label="At a glance" stats={stats} />;
}

/**
 * What the account received, beside the other figures. On its own: adding up
 * a large account's receipts takes a while the first time.
 */
async function Received({ did, base }: { did: string; base: string }) {
  const { received } = await hasFunding(did);
  if (!received) return null;
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

/** The figures on their way. */
function FiguresSkeleton() {
  return (
    <div className="stat-row" aria-hidden>
      {skeletonSlots(3).map((slot) => (
        <Skeleton key={slot} variant="box" className="skeleton-stat" />
      ))}
    </div>
  );
}

/** What the account did, newest first: its feed's first page. */
async function Latest({ did }: { did: string }) {
  const initial = await getProfileFeed(did);
  return (
    <Section title="Latest">
      <ProfileFeed did={did} initial={initial} />
    </Section>
  );
}

/** The feed on its way: its heading and a few cards. */
function LatestSkeleton() {
  return (
    <div className="profile-section" aria-hidden>
      <Skeleton variant="line" className="skeleton-heading" />
      <ProfileFeedSkeleton />
    </div>
  );
}

/** The Overview on its way: shaped like its column of sections and the rail. */
function OverviewSkeleton() {
  return (
    <div className="profile-overview" aria-hidden>
      <div className="profile-main">
        <FiguresSkeleton />
        <LatestSkeleton />
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
        <div className="profile-figures">
          <Suspense fallback={<FiguresSkeleton />}>
            <Figures did={did} base={base} />
          </Suspense>
          <Suspense fallback={null}>
            <Received did={did} base={base} />
          </Suspense>
        </div>
        {/* The header's lead is the bio, so an organization's longer
            description gets its own section. */}
        {about && (
          <Section title="About">
            <Text relaxed className="prewrap measure" dir="auto">
              {about}
            </Text>
          </Section>
        )}
        <Suspense fallback={<LatestSkeleton />}>
          <Latest did={did} />
        </Suspense>
      </div>
      <aside className="profile-rail" aria-label="Facts about this account">
        {actor.place && (
          <Card variant="panel" className="overview-box">
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
        <Card variant="panel" className="overview-box">
          <Heading level={2} size="heading">
            Account
          </Heading>
          <dl className="facts">
            {/* Only when it differs from the name the profile shows. */}
            {actor.legalName &&
              actor.legalName.toLowerCase() !== actor.displayName.toLowerCase() && (
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
