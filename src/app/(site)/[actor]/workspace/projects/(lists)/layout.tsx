import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { NewWorkButton } from "@/components/new-work-button";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { WorkspaceSectionHead } from "@/components/workspace-section-head";
import { getWork } from "@/lib/hypercerts/queries";

// Workspace → Projects and activities: the account's projects, and its
// activities, each a tab under the section's head (as Badges and
// Endorsements are). Each tab is its own page; counts and rows are cached
// public data. The forms (new-project, new-activity, edit-…) sit beside this
// group, without the tab bar.

const LABELS = ["Projects", "Activities"];

function tabs(base: string, counts?: number[]) {
  const paths = ["", "/activities"];
  return LABELS.map((label, i) => ({
    label,
    href: `${base}${paths[i]}`,
    count: counts && counts[i] > 0 ? String(counts[i]) : undefined,
  }));
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = decodeURIComponent((await params).actor);
  const base = `${workspaceHref(did)}/projects`;
  return (
    <Suspense fallback={<ProfileTabs label="Projects and activities" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const work = await getWork(did);
  return (
    <ProfileTabs
      label="Projects and activities"
      tabs={tabs(base, [work.projects.length, work.activities.length])}
    />
  );
}

async function Action({ params }: { params: Promise<{ actor: string }> }) {
  const did = decodeURIComponent((await params).actor);
  return <NewWorkButton section={`${workspaceHref(did)}/projects`} />;
}

export default function ProjectsLayout({
  children,
  params,
}: LayoutProps<"/[actor]/workspace/projects">) {
  return (
    <>
      <WorkspaceSectionHead
        title="Projects and activities"
        tabs={
          <Suspense fallback={<ProfileTabsSkeleton labels={LABELS} />}>
            <Tabs params={params} />
          </Suspense>
        }
        action={
          <Suspense fallback={null}>
            <Action params={params} />
          </Suspense>
        }
      />
      {/* Each page shows its own skeleton while it loads, so a tab switches at once. */}
      {children}
    </>
  );
}
