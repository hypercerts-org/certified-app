import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { workspaceDid } from "@/components/workspace-access";
import { EndorseSomeone } from "@/components/workspace-endorsements";
import { WorkspaceSectionHead } from "@/components/workspace-section-head";
import { getEndorsements, listLists } from "@/lib/hypercerts/queries";

// Workspace → Endorsements: received, given and the endorsement lists, each
// its own page under the tab bar. Every count and row is public data about
// the account, cached, so the tabs' links prefetch their pages.

const numberFormat = new Intl.NumberFormat("en");

function tabs(base: string, counts?: { received: string; given: string; lists: string }) {
  return [
    { label: "Received", href: base, count: counts?.received },
    { label: "Given", href: `${base}/given`, count: counts?.given },
    { label: "Endorsement lists", href: `${base}/lists`, count: counts?.lists },
  ];
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  const base = `${workspaceHref(did)}/endorsements`;
  return (
    <Suspense fallback={<ProfileTabs label="Endorsements" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const [endorsements, { lists }] = await Promise.all([getEndorsements(did), listLists(did)]);
  const { receivedCount, hiddenCount, given } = endorsements;
  const shown = numberFormat.format(receivedCount);
  return (
    <ProfileTabs
      label="Endorsements"
      tabs={tabs(base, {
        // The API's totals, the numbers the profile and the Overview give,
        // with the hidden ones beside them.
        received: hiddenCount > 0 ? `${shown} · ${numberFormat.format(hiddenCount)} hidden` : shown,
        given: numberFormat.format(given),
        lists: numberFormat.format(lists.filter((list) => list.kind === "Endorsements").length),
      })}
    />
  );
}

async function EndorseSomeoneAction({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  return <EndorseSomeone repo={did} />;
}

export default function EndorsementsLayout({
  children,
  params,
}: LayoutProps<"/[actor]/workspace/endorsements">) {
  return (
    <>
      <WorkspaceSectionHead
        title="Endorsements"
        tabs={
          <Suspense
            fallback={<ProfileTabsSkeleton labels={["Received", "Given", "Endorsement lists"]} />}
          >
            <Tabs params={params} />
          </Suspense>
        }
        action={
          <Suspense fallback={null}>
            <EndorseSomeoneAction params={params} />
          </Suspense>
        }
      />
      {/* Each page shows its own skeleton while it loads, so a tab switches at once. */}
      {children}
    </>
  );
}
