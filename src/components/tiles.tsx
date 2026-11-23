import { Folder } from "lucide-react";
import { Empty } from "@/components/empty";
import { listActivitiesPage, listProjectsPage } from "@/lib/hypercerts/queries";
import { ActivityList } from "./activity-list";
import { ProjectCardView, WorkCardsSkeleton } from "./cards";
import { Tile, TileSkeleton } from "./tile";

// Profile tiles. Each tile fetches its own data, so a page can show, hide or
// reorder tiles without the others knowing. That is the separability the
// product definition asks for, at its simplest. Pages place them in a
// <TileSlot>, so a slow or failing tile never holds up the others.

export async function ActivitiesTile({ did }: { did: string }) {
  const page = await listActivitiesPage({ author: did, limit: 6 });
  return (
    <Tile title="Activities">
      <ActivityList initial={page} source={{ kind: "author", did }} showAuthor={false} />
    </Tile>
  );
}

export async function ProjectsTile({ did }: { did: string }) {
  const page = await listProjectsPage({ author: did });
  return (
    <Tile title="Projects">
      {page.items.length === 0 ? (
        <Empty icon={Folder} title="No projects yet" />
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

export function ActivitiesTileSkeleton() {
  return (
    <TileSkeleton title="Activities">
      <WorkCardsSkeleton count={4} />
    </TileSkeleton>
  );
}

export function ProjectsTileSkeleton() {
  return (
    <TileSkeleton title="Projects">
      <WorkCardsSkeleton count={2} />
    </TileSkeleton>
  );
}
