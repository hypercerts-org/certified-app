import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { workspaceDid } from "@/components/workspace-access";
import { WorkspaceSectionHead } from "@/components/workspace-section-head";
import { getFollowCounts } from "@/lib/hypercerts/queries";

// Workspace → Followers: who follows the account, and whom it follows
// (accounts and projects), each its own page under the tab bar. Following
// counts both kinds, as the profile does.

const numberFormat = new Intl.NumberFormat("en");

function tabs(base: string, counts?: { followers: string; following: string }) {
  return [
    { label: "Followers", href: base, count: counts?.followers },
    { label: "Following", href: `${base}/following`, count: counts?.following },
  ];
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  const base = `${workspaceHref(did)}/followers`;
  return (
    <Suspense fallback={<ProfileTabs label="Followers" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const counts = await getFollowCounts(did);
  return (
    <ProfileTabs
      label="Followers"
      tabs={tabs(base, {
        followers: numberFormat.format(counts.followers),
        following: `${numberFormat.format(counts.following)}${counts.followingMore ? "+" : ""}`,
      })}
    />
  );
}

export default function FollowersLayout({
  children,
  params,
}: LayoutProps<"/[actor]/workspace/followers">) {
  return (
    <>
      <WorkspaceSectionHead
        title="Followers"
        tabs={
          <Suspense fallback={<ProfileTabsSkeleton labels={["Followers", "Following"]} />}>
            <Tabs params={params} />
          </Suspense>
        }
      />
      {/* Each page shows its own skeleton while it loads, so a tab switches at once. */}
      {children}
    </>
  );
}
