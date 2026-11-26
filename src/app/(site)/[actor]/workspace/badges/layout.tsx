import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { workspaceDid } from "@/components/workspace-access";
import { NewBadge } from "@/components/workspace-badges";
import { WorkspaceSectionHead } from "@/components/workspace-section-head";
import {
  getAwardedBadges,
  getBadges,
  getRejectedBadges,
  getYourBadges,
} from "@/lib/hypercerts/queries";

// Workspace → Badges: those others awarded the account (Received), those it
// awarded others (Awarded), and the badges it created to award (Your
// badges). Each tab is its own page under the tab bar; counts and rows are
// cached public data.

const LABELS = ["Received", "Awarded", "Your badges"];

function tabs(base: string, counts?: number[]) {
  const paths = ["", "/awarded", "/yours"];
  return LABELS.map((label, i) => ({
    label,
    href: `${base}${paths[i]}`,
    count: counts && counts[i] > 0 ? String(counts[i]) : undefined,
  }));
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  const base = `${workspaceHref(did)}/badges`;
  return (
    <Suspense fallback={<ProfileTabs label="Badges" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const [received, rejected, awarded, yours] = await Promise.all([
    getBadges(did),
    getRejectedBadges(did),
    getAwardedBadges(did),
    getYourBadges(did),
  ]);
  const counts = [
    received.awaiting.length + received.accepted.length + rejected.length,
    awarded.badges.length,
    yours.length,
  ];
  return <ProfileTabs label="Badges" tabs={tabs(base, counts)} />;
}

async function NewBadgeAction({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  return <NewBadge repo={did} />;
}

export default function BadgesLayout({
  children,
  params,
}: LayoutProps<"/[actor]/workspace/badges">) {
  return (
    <>
      <WorkspaceSectionHead
        title="Badges"
        tabs={
          <Suspense fallback={<ProfileTabsSkeleton labels={LABELS} />}>
            <Tabs params={params} />
          </Suspense>
        }
        action={
          <Suspense fallback={null}>
            <NewBadgeAction params={params} />
          </Suspense>
        }
      />
      {/* Each page shows its own skeleton while it loads, so a tab switches at once. */}
      {children}
    </>
  );
}
