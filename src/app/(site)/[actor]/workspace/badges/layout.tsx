import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { NewBadge } from "@/components/workspace-badges";
import { getBadges, getIssuedBadges, getRejectedBadges } from "@/lib/hypercerts/queries";

// Workspace → Badges: received ones by the account's response (awaiting
// first: those ask for one), then the badges it defined. Each tab is its own
// page under the tab bar; counts and rows are cached public data.

const LABELS = ["Awaiting response", "Accepted", "Rejected", "Issued"];

function tabs(base: string, counts?: number[]) {
  const paths = ["", "/accepted", "/rejected", "/issued"];
  return LABELS.map((label, i) => ({
    label,
    href: `${base}${paths[i]}`,
    count: counts && counts[i] > 0 ? String(counts[i]) : undefined,
  }));
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = decodeURIComponent((await params).actor);
  const base = `${workspaceHref(did)}/badges`;
  return (
    <Suspense fallback={<ProfileTabs label="Badges" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const [received, rejected, issued] = await Promise.all([
    getBadges(did),
    getRejectedBadges(did),
    getIssuedBadges(did),
  ]);
  const counts = [
    received.awaiting.length,
    received.accepted.length,
    rejected.length,
    issued.badges.length,
  ];
  return <ProfileTabs label="Badges" tabs={tabs(base, counts)} />;
}

export default function BadgesLayout({
  children,
  params,
}: LayoutProps<"/[actor]/workspace/badges">) {
  return (
    <>
      <PageTitle className="workspace-title">Badges</PageTitle>
      <div className="workspace-tabbar">
        <Suspense fallback={<ProfileTabsSkeleton labels={LABELS} />}>
          <Tabs params={params} />
        </Suspense>
        <NewBadge />
      </div>
      {/* Each page shows its own skeleton while it loads, so a tab switches at once. */}
      {children}
    </>
  );
}
