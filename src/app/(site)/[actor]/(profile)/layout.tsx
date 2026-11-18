import { notFound } from "next/navigation";
import { Suspense } from "react";
import { type ProfileTab, ProfileTabs } from "@/components/profile-actions";
import { ProfileHeader, ProfileHeaderSkeleton } from "@/components/profile-header";
import {
  type Count,
  getActor,
  getEndorsements,
  getFollowCounts,
  getRecordCounts,
} from "@/lib/hypercerts/queries";
import { profileBase } from "@/lib/profile-route";

// A public profile: the header, then its pages as tabs. Each tab is its own
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
  const base = profileBase(id);
  return (
    <>
      <ProfileHeader actor={actor} base={base} />
      <Suspense fallback={<Tabs base={base} />}>
        <TabsWithCounts did={actor.did} base={base} />
      </Suspense>
    </>
  );
}

const numberFormat = new Intl.NumberFormat("en");
const format = (count: Count | number) =>
  typeof count === "number"
    ? numberFormat.format(count)
    : `${numberFormat.format(count.value)}${count.capped ? "+" : ""}`;
const value = (count: Count | number) => (typeof count === "number" ? count : count.value);

type TabCounts = {
  activities: Count;
  projects: Count;
  endorsementsReceived: number;
  endorsementsGiven: number;
  followers: number;
  following: number;
  lists: Count;
};

/** Overview always; the others once their counts are known, and only when not empty. */
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
      // No count on a tab with none ("Endorsements" with only some given).
      count: count === undefined || value(count) === 0 ? undefined : format(count),
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
        tab("Lists", "/lists", counts?.lists),
      ]}
    />
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const [records, endorsements, follows] = await Promise.all([
    getRecordCounts(did),
    getEndorsements(did),
    getFollowCounts(did),
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
      }}
    />
  );
}

export default function ProfileLayout({ children, params }: LayoutProps<"/[actor]">) {
  return (
    <div className="page profile">
      <Suspense fallback={<ProfileHeaderSkeleton />}>
        <Header params={params} />
      </Suspense>
      {children}
    </div>
  );
}
