import { EmptyState } from "@hypercerts-org/ui-react";
import { listActivitiesPage, listProjectsPage } from "@/lib/hypercerts/queries";
import { ActivityList } from "./activity-list";
import { ProjectCardView } from "./cards";
import { Tile } from "./tile";

// Profile tiles. Each tile fetches its own data, so a page can show, hide or
// reorder tiles without the others knowing. That is the separability the
// product definition asks for, at its simplest. Pages place them in a
// <TileSlot>, so a slow or failing tile never holds up the others.

export async function ActivitiesTile({ did }: { did: string }) {
  const page = await listActivitiesPage({ author: did, limit: 6 });
  return (
    <Tile
      title="Activities"
      embedPath={`/embed/activities?${new URLSearchParams({ author: did })}`}
    >
      <ActivityList initial={page} source={{ kind: "author", did }} showAuthor={false} />
    </Tile>
  );
}

export async function ProjectsTile({ did }: { did: string }) {
  const page = await listProjectsPage({ author: did });
  return (
    <Tile title="Projects">
      {page.items.length === 0 ? (
        <EmptyState title="No projects yet" />
      ) : (
        <ul className="work-grid">
          {page.items.map((project) => (
            <ProjectCardView key={project.uri} project={project} />
          ))}
        </ul>
      )}
    </Tile>
  );
}
