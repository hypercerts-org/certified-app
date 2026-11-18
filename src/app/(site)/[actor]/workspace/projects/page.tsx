import type { Metadata } from "next";
import { Suspense } from "react";
import { actorHref, projectHref } from "@/components/cards";
import {
  type WorkFolder,
  WorkFolders,
  WorkFoldersSkeleton,
  type WorkRow,
} from "@/components/work-folders";
import { WorkspaceAccess } from "@/components/workspace-access";
import { getWork, type Work } from "@/lib/hypercerts/queries";
import type { ActivityCard } from "@/lib/hypercerts/views";

export const metadata: Metadata = {
  title: "Projects and activities",
  robots: { index: false },
};

// A workspace's projects with their activities, as folders (staging's
// `/records?kind=activities`). All of it is public data about the account,
// cached, so the sidebar's link prefetches it and the page shows at once.

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
    uri: activity.uri,
    title: activity.title,
    imageUrl: activity.imageUrl,
    meta: activity.period ?? (activity.createdAt ? `Created ${activity.createdAt}` : "Activity"),
    alsoIn: (projectsOf.get(activity.uri) ?? []).filter((title) => title !== folder),
    by:
      activity.author.did === did
        ? null
        : { name: activity.author.displayName, href: actorHref(activity.author) },
  });

  const folders: WorkFolder[] = work.projects.map((project) => {
    // Activities that couldn't be loaded (deleted, or not indexed) are left out.
    const rows = project.activityUris.flatMap((uri) => {
      const activity = activities.get(uri);
      return activity ? [row(activity, project.title)] : [];
    });
    return {
      key: project.uri,
      title: project.title,
      href: projectHref(project),
      imageUrl: project.imageUrl,
      meta: `Project · ${count(rows.length, "activity", "activities")}`,
      rows,
    };
  });

  const loose = work.activities.filter((activity) => !projectsOf.has(activity.uri));
  if (loose.length > 0) {
    folders.push({
      key: "loose",
      title: "Without a project",
      href: null,
      imageUrl: null,
      meta: count(loose.length, "activity", "activities"),
      rows: loose.map((activity) => row(activity, null)),
    });
  }
  return folders;
}

async function WorkSection({ did }: { did: string }) {
  const work = await getWork(did);
  return (
    <WorkFolders
      folders={toFolders(did, work)}
      note={work.truncated ? "Showing the first 500 activities and projects." : null}
    />
  );
}

export default function ProjectsPage({ params }: PageProps<"/[actor]/workspace/projects">) {
  return (
    <>
      <h1 className="workspace-title">Projects and activities</h1>
      <Suspense fallback={<WorkFoldersSkeleton />}>
        <WorkspaceAccess params={params} section="/projects">
          {({ did }) => <WorkSection did={did} />}
        </WorkspaceAccess>
      </Suspense>
    </>
  );
}
