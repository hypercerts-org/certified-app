import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabsSkeleton, RouteTabs } from "@/components/profile-actions";
import { ProfileAddress } from "@/components/profile-address";
import { ProfileHeader, ProfileHeaderSkeleton } from "@/components/profile-header";
import { ProfileRail, ProfileRailSkeleton } from "@/components/profile-rail";
import { getActorCore } from "@/lib/hypercerts/queries";
import { canonicalProfileBase, profileBase } from "@/lib/profile-route";

// A public profile: the header, then its pages as tabs beside its facts. Each tab is its own
// URL, prerendered and cached like the rest of the profile; only the header's
// actions depend on who is viewing. Profiles live at their handle; a page
// opened by DID moves there (src/lib/profile-route.ts).
//
// Everything here starts from the account as the API has it (getActorCore,
// one or two API calls), not from its checked handle: checking a handle takes
// outside lookups, up to a second for an account nobody opened lately. The
// parts that show the handle or the place stream in on their own.

// Keep App Shell and hover per-link prefetches static: signed-in chrome and
// viewer actions live behind Suspense and stream in on navigation, so links
// and tabs never fire per-link runtime server renders before a click.
export const ensureStatic = "prefetch";

// Prerender one known organization at build time; every other profile is
// prerendered on its first visit and cached per URL (ISR), header, tabs and
// rail included, so a later visit shows them at once. On Vercel a click to a
// profile not yet cached waits for that prerender, so it holds only what the
// API answers quickly. Whatever needs outside lookups or slow API filters
// (handle checks, the place, figures, endorsers, follow counts, "Also on" and
// every tab's content) calls connection(): it is left out of the cached page
// and streams in on each visit, from the data cache.
export async function generateStaticParams() {
  return [{ actor: "together4trees-ken.certified.one" }];
}

async function Header({ params }: { params: Promise<{ actor: string }> }) {
  const id = (await params).actor;
  const actor = await getActorCore(decodeURIComponent(id));
  if (!actor) notFound();
  return <ProfileHeader actor={actor} base={profileBase(id)} />;
}

/** The right column, the same on every tab. */
async function Rail({ params }: { params: Promise<{ actor: string }> }) {
  const id = (await params).actor;
  const actor = await getActorCore(decodeURIComponent(id));
  if (!actor) return null;
  return <ProfileRail actor={actor} base={profileBase(id)} />;
}

/** Moves the page to the profile's own address, once its handle is checked. */
async function Address({ params }: { params: Promise<{ actor: string }> }) {
  const id = (await params).actor;
  await connection(); // the handle check: on each visit, not in the cached page
  const to = await canonicalProfileBase(id);
  return to ? <ProfileAddress from={profileBase(id)} to={to} /> : null;
}

const TABS = [
  { label: "Overview", path: "", also: [] },
  { label: "Activities", path: "/activities", also: [] },
  { label: "Projects", path: "/projects", also: [] },
  { label: "Endorsements", path: "/endorsements", also: ["/endorsements/given"] },
  { label: "Followers", path: "/followers", also: ["/following"] },
  {
    label: "Badges",
    path: "/badges",
    also: ["/badges/awaiting", "/badges/projects", "/badges/issued"],
  },
  { label: "Lists", path: "/lists", also: [], nested: true },
  { label: "Funding", path: "/funding", also: ["/funding/given", "/funding/confirmed"] },
] as const;

// The header across the top; then two columns, each with a maximum width:
// on the left the tabs and the tab's page, on the right the account's
// figures and facts, level with the tabs (globals.css, .page-columns).
export default function ProfileLayout({ children, params }: LayoutProps<"/[actor]">) {
  return (
    <div className="page profile">
      <Suspense fallback={null}>
        <Address params={params} />
      </Suspense>
      <Suspense fallback={<ProfileHeaderSkeleton />}>
        <Header params={params} />
      </Suspense>
      <div className="page-columns">
        <div className="page-main">
          <Suspense fallback={<ProfileTabsSkeleton labels={TABS.map((tab) => tab.label)} />}>
            <RouteTabs label="Profile" baseSegments={1} tabs={TABS} />
          </Suspense>
          {children}
        </div>
        <aside className="page-rail" aria-label="About this account">
          <Suspense fallback={<ProfileRailSkeleton />}>
            <Rail params={params} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
