import { notFound } from "next/navigation";
import { Suspense } from "react";
import { type ProfileTab, ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { ProfileHeader, ProfileHeaderSkeleton } from "@/components/profile-header";
import { ProfileRail, ProfileRailSkeleton } from "@/components/profile-rail";
import {
  type Count,
  getActor,
  getBadges,
  getEndorsements,
  getFollowCounts,
  getIssuedBadges,
  getRecordCounts,
  hasFunding,
} from "@/lib/hypercerts/queries";
import { profileBase } from "@/lib/profile-route";

// A public profile: the header, then its pages as tabs beside its facts. Each tab is its own
// URL, prerendered and cached like the rest of the profile; only the header's
// actions depend on who is viewing. Profiles live at their handle; a page
// opened by DID redirects there (src/lib/profile-route.ts).

// Prerender one known organization at build time; every other actor gets the
// app shell first and is then rendered and cached per URL (ISR).
export async function generateStaticParams() {
  return [{ actor: "together4trees-ken.certified.one" }];
}

async function Header({ params }: { params: Promise<{ actor: string }> }) {
  const id = (await params).actor;
  const actor = await getActor(decodeURIComponent(id));
  if (!actor) notFound();
  return <ProfileHeader actor={actor} base={profileBase(id)} />;
}

/** The tabs, over the left column: they switch what it shows. */
async function Nav({ params }: { params: Promise<{ actor: string }> }) {
  const id = (await params).actor;
  const actor = await getActor(decodeURIComponent(id));
  if (!actor) return null;
  const base = profileBase(id);
  return (
    <Suspense fallback={<Tabs base={base} />}>
      <TabsWithCounts did={actor.did} base={base} />
    </Suspense>
  );
}

/** The right column, the same on every tab. */
async function Rail({ params }: { params: Promise<{ actor: string }> }) {
  const id = (await params).actor;
  const actor = await getActor(decodeURIComponent(id));
  if (!actor) return null;
  return <ProfileRail actor={actor} base={profileBase(id)} />;
}

const value = (count: Count | number) => (typeof count === "number" ? count : count.value);

type TabCounts = {
  activities: Count;
  projects: Count;
  endorsementsReceived: number;
  endorsementsGiven: number;
  followers: number;
  following: number;
  lists: Count;
  badgesAccepted: number;
  badgesAwaiting: number;
  badgesIssued: number;
  /** Whether the account received or gave any funding. */
  funding: boolean;
};

/**
 * Overview always; the others once their counts are known, and only when not
 * empty. The tabs carry no numbers: several hold lists of their own (received
 * and given, followers and following), so one number on the tab misleads, and
 * the header already says how many follow and who endorsed.
 */
function Tabs({ base, counts }: { base: string; counts?: TabCounts }) {
  const tab = (
    label: string,
    path: string,
    count?: Count | number,
    also?: string[],
    empty = count === undefined || value(count) === 0,
  ) =>
    ({
      label,
      href: `${base}${path}`,
      also: also?.map((sub) => `${base}${sub}`),
      empty,
    }) satisfies ProfileTab;
  return (
    <ProfileTabs
      label="Profile"
      tabs={[
        { label: "Overview", href: base },
        tab("Activities", "/activities", counts?.activities),
        tab("Projects", "/projects", counts?.projects),
        // Counts endorsements received, and shows while either list has one.
        tab(
          "Endorsements",
          "/endorsements",
          counts?.endorsementsReceived,
          ["/endorsements/given"],
          !counts || counts.endorsementsReceived + counts.endorsementsGiven === 0,
        ),
        // Counts followers, and shows while either list has someone in it.
        tab(
          "Followers",
          "/followers",
          counts?.followers,
          ["/following"],
          !counts || counts.followers + counts.following === 0,
        ),
        // Counts accepted badges, and shows while any of its lists has one
        // (an issuer may hold none).
        tab(
          "Badges",
          "/badges",
          counts?.badgesAccepted,
          ["/badges/awaiting", "/badges/issued"],
          !counts || counts.badgesAccepted + counts.badgesAwaiting + counts.badgesIssued === 0,
        ),
        { ...tab("Lists", "/lists", counts?.lists), nested: true },
        // No count: totals are in several currencies (the tab shows them).
        {
          label: "Funding",
          href: `${base}/funding`,
          also: [`${base}/funding/given`, `${base}/funding/confirmed`],
          empty: !counts?.funding,
        },
      ]}
    />
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const [records, endorsements, follows, badges, issued, funding] = await Promise.all([
    getRecordCounts(did),
    getEndorsements(did),
    getFollowCounts(did),
    getBadges(did),
    getIssuedBadges(did),
    hasFunding(did),
  ]);
  return (
    <Tabs
      base={base}
      counts={{
        activities: records.activities,
        projects: records.projects,
        endorsementsReceived: endorsements.receivedCount,
        endorsementsGiven: endorsements.given,
        followers: follows.followers,
        following: follows.following,
        lists: records.lists,
        badgesAccepted: badges.accepted.length,
        badgesAwaiting: badges.awaiting.length,
        badgesIssued: issued.badges.length,
        funding: funding.received || funding.given || funding.confirmed,
      }}
    />
  );
}

// The header across the top; then two columns, each with a maximum width:
// on the left the tabs and the tab's page, on the right the account's
// figures and facts, level with the tabs (globals.css, .profile-columns).
export default function ProfileLayout({ children, params }: LayoutProps<"/[actor]">) {
  return (
    <div className="page profile">
      <Suspense fallback={<ProfileHeaderSkeleton />}>
        <Header params={params} />
      </Suspense>
      <div className="profile-columns">
        <div className="profile-main">
          <Suspense fallback={<ProfileTabsSkeleton labels={["Overview"]} />}>
            <Nav params={params} />
          </Suspense>
          {children}
        </div>
        <aside className="profile-rail" aria-label="About this account">
          <Suspense fallback={<ProfileRailSkeleton />}>
            <Rail params={params} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
