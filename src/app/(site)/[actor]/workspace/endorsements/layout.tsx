import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import { ProfileTabs } from "@/components/profile-actions";
import { EndorseSomeone } from "@/components/workspace-endorsements";
import { listEndorsements, listLists } from "@/lib/hypercerts/queries";

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
  const did = decodeURIComponent((await params).actor);
  const base = `${workspaceHref(did)}/endorsements`;
  return (
    <Suspense fallback={<ProfileTabs label="Endorsements" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const [received, given, { lists }] = await Promise.all([
    listEndorsements(did, "received", true),
    listEndorsements(did, "given"),
    listLists(did),
  ]);
  const hidden = received.rows.filter((row) => row.hidden).length;
  const shown = numberFormat.format(received.rows.length - hidden);
  return (
    <ProfileTabs
      label="Endorsements"
      tabs={tabs(base, {
        // The shown ones, the number the profile and the Overview give; the
        // hidden ones beside it.
        received: hidden > 0 ? `${shown} · ${numberFormat.format(hidden)} hidden` : shown,
        given: numberFormat.format(given.rows.length),
        lists: numberFormat.format(lists.filter((list) => list.kind === "Endorsements").length),
      })}
    />
  );
}

export default function EndorsementsLayout({
  children,
  params,
}: LayoutProps<"/[actor]/workspace/endorsements">) {
  return (
    <>
      <PageTitle className="workspace-title">Endorsements</PageTitle>
      <div className="workspace-tabbar">
        <Suspense fallback={<div className="profile-tabs" />}>
          <Tabs params={params} />
        </Suspense>
        <EndorseSomeone />
      </div>
      {/* Its pages load behind loading.tsx, so a tab switches at once. */}
      {children}
    </>
  );
}
