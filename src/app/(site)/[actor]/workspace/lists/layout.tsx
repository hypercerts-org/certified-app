import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { ListTabAction } from "@/components/list-tab-action";
import { PageTitle } from "@/components/page-title";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { LIST_KINDS } from "@/components/workspace-lists";
import { listLists } from "@/lib/hypercerts/queries";

// Workspace → Lists: the account's lists, one tab per kind, each its own page
// under the tab bar. All of it is public data about the account, cached, so
// the tabs' links prefetch their pages.

const numberFormat = new Intl.NumberFormat("en");

function tabs(base: string, counts?: Map<string, number>) {
  return LIST_KINDS.map((kind) => {
    const n = counts?.get(kind.label);
    return {
      label: kind.label,
      href: `${base}${kind.path}`,
      count: counts ? numberFormat.format(n ?? 0) : undefined,
    };
  });
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = decodeURIComponent((await params).actor);
  const base = `${workspaceHref(did)}/lists`;
  return (
    <>
      <Suspense fallback={<ProfileTabs label="Lists" tabs={tabs(base)} />}>
        <TabsWithCounts did={did} base={base} />
      </Suspense>
      <ListTabAction base={base} />
    </>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const { lists } = await listLists(did);
  const counts = new Map<string, number>();
  for (const list of lists) counts.set(list.kind, (counts.get(list.kind) ?? 0) + 1);
  return <ProfileTabs label="Lists" tabs={tabs(base, counts)} />;
}

export default function ListsLayout({ children, params }: LayoutProps<"/[actor]/workspace/lists">) {
  return (
    <>
      <PageTitle className="workspace-title">Lists</PageTitle>
      <div className="workspace-tabbar">
        <Suspense fallback={<ProfileTabsSkeleton labels={LIST_KINDS.map((kind) => kind.label)} />}>
          <Tabs params={params} />
        </Suspense>
      </div>
      {/* Each page shows its own skeleton while it loads, so a tab switches at once. */}
      {children}
    </>
  );
}
