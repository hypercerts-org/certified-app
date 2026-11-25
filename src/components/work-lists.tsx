// Workspace → Projects and activities: the section's two tabs, as lists of
// the same rows the rest of the app uses (records.tsx), each row opening its
// record's page, where its menu edits it. Projects say how many activities
// they hold; activities say which projects they are in. The section's action
// is the tab's own: New project, or New activity (new-work-button).

import { Folder, SquareCheckBig } from "lucide-react";
import { Empty } from "@/components/empty";
import { ActivityRow, ProjectRow, RecordRowSkeleton } from "@/components/records";
import type { ActivityCard, ProjectCard } from "@/lib/hypercerts/views";

/** The account's projects, newest first. */
export function WorkProjects({ projects, note }: { projects: ProjectCard[]; note: string | null }) {
  if (projects.length === 0) {
    return (
      <Empty
        icon={Folder}
        title="No projects yet"
        description="A project groups activities, like a folder, to show how they fit together."
      />
    );
  }
  return (
    <>
      <ul className="list-items divided">
        {projects.map((project) => (
          <li key={project.uri} className="list-item">
            <ProjectRow project={project} />
          </li>
        ))}
      </ul>
      {note && <p className="work-note">{note}</p>}
    </>
  );
}

/** An activity with the titles of the projects it is in. */
export type WorkActivity = { activity: ActivityCard; projects: string[] };

/** "In Forest", "In Forest and 2 more". */
function inProjects([first, ...rest]: string[]) {
  if (!first) return null;
  return (
    <span className="work-in" dir="auto">
      In {first}
      {rest.length > 0 && ` and ${rest.length} more`}
    </span>
  );
}

/** The account's activities, newest first. */
export function WorkActivities({
  activities,
  note,
}: {
  activities: WorkActivity[];
  note: string | null;
}) {
  if (activities.length === 0) {
    return (
      <Empty
        icon={SquareCheckBig}
        title="No activities yet"
        description="An activity records a piece of work: what was done, by whom, when and where."
      />
    );
  }
  return (
    <>
      <ul className="list-items divided">
        {activities.map(({ activity, projects }) => (
          <li key={activity.uri} className="list-item">
            <ActivityRow activity={activity} end={inProjects(projects)} />
          </li>
        ))}
      </ul>
      {note && <p className="work-note">{note}</p>}
    </>
  );
}

/** A tab's list on its way: rows shaped like the ones coming. */
export function WorkListSkeleton() {
  return (
    <div className="list-items divided" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="list-item">
          <RecordRowSkeleton />
        </div>
      ))}
    </div>
  );
}
