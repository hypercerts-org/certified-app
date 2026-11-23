import type { Metadata } from "next";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { PageTitle } from "@/components/page-title";
import {
  type WorkFolder,
  WorkFolders,
  WorkFoldersSkeleton,
  type WorkRow,
} from "@/components/work-folders";
import { workspaceDid } from "@/components/workspace-access";
import { getWork, type Work } from "@/lib/hypercerts/queries";
import type { ActivityCard } from "@/lib/hypercerts/views";

export const metadata: Metadata = {
  title: "Projects and activities",
  robots: { index: false },
};

// A workspace's projects with their activities, as folders (staging's
// `/records?kind=activities`). All of it is public data about the account,
// cached, so the sidebar's link prefetches it and the page shows at once.

/** The folders: each project, then "Without a project" for the rest. */
function toFolders(did: string, work: Work): WorkFolder[] {
  const activities = new Map<string, ActivityCard>(
    [...work.activities, ...work.others].map((activity) => [activity.uri, activity]),
  );
  const projectsOf = new Map<string, string[]>();
  for (const project of work.projects)
    for (const uri of project.activityUris)
      projectsOf.set(uri, [...(projectsOf.get(uri) ?? []), project.title]);

  const row = (activity: ActivityCard, folder: string | null): WorkRow => ({
    activity,
    alsoIn: (projectsOf.get(activity.uri) ?? []).filter((title) => title !== folder),
  });

  const folders: WorkFolder[] = work.projects.map((project) => ({
    key: project.uri,
    project,
    owner: did,
    // Activities that couldn't be loaded (deleted, or not indexed) are left out.
    rows: project.activityUris.flatMap((uri) => {
      const activity = activities.get(uri);
      return activity ? [row(activity, project.title)] : [];
    }),
  }));

  const loose = work.activities.filter((activity) => !projectsOf.has(activity.uri));
  if (loose.length > 0) {
    folders.push({
      key: "loose",
      project: null,
      owner: did,
      rows: loose.map((activity) => row(activity, null)),
    });
  }
  return folders;
}

async function WorkSection({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const work = await getWork(did);
  return (
    <WorkFolders
      folders={toFolders(did, work)}
      note={work.truncated ? "Showing the first 500 activities and projects." : null}
      section={`${workspaceHref(did)}/projects`}
    />
  );
}

export default function ProjectsPage({ params }: PageProps<"/[actor]/workspace/projects">) {
  return (
    <>
      <PageTitle className="workspace-title">Projects and activities</PageTitle>
      <Suspense fallback={<WorkFoldersSkeleton />}>
        <WorkSection params={params} />
      </Suspense>
    </>
  );
}
