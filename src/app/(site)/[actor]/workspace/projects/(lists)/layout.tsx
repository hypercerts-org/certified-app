import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { NewWorkButton } from "@/components/new-work-button";
import { ProfileTabs, ProfileTabsSkeleton } from "@/components/profile-actions";
import { workspaceDid } from "@/components/workspace-access";
import { WorkspaceSectionHead } from "@/components/workspace-section-head";
import { getWork } from "@/lib/hypercerts/queries";

// Workspace → Projects and activities: the account's projects, and its
// activities, each a tab under the section's head (as Badges and
// Endorsements are). Each tab is its own page; counts and rows are cached
// public data. The forms (new-project, new-activity, edit-…) sit beside this
// group, without the tab bar.

const LABELS = ["Projects", "Activities"];

function tabs(base: string, counts?: (string | undefined)[]) {
  const paths = ["", "/activities"];
  return LABELS.map((label, i) => ({
    label,
    href: `${base}${paths[i]}`,
    count: counts?.[i],
  }));
}

async function Tabs({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  const base = `${workspaceHref(did)}/projects`;
  return (
    <Suspense fallback={<ProfileTabs label="Projects and activities" tabs={tabs(base)} />}>
      <TabsWithCounts did={did} base={base} />
    </Suspense>
  );
}

async function TabsWithCounts({ did, base }: { did: string; base: string }) {
  const work = await getWork(did);
  const plus = work.truncated ? "+" : "";
  const count = (n: number) => (n > 0 ? `${n}${plus}` : undefined);
  return (
    <ProfileTabs
      label="Projects and activities"
      tabs={tabs(base, [count(work.projects.length), count(work.activities.length)])}
    />
  );
}

async function Action({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
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
