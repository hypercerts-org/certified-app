import {
  Badge,
  EmptyState,
  Eyebrow,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react"
import {
  listActivitiesPage,
  listBadgesReceived,
  listProjectsPage,
} from "@/lib/hypercerts/queries"
import type { ActorDetail } from "@/lib/hypercerts/views"
import { ActivityList } from "./activity-list"
import { BadgeCardView, ProjectCardView } from "./cards"

// Profile tiles. Each tile fetches its own data, so a page can show, hide or
// reorder tiles without the others knowing. That is the separability the
// product definition asks for, at its simplest.

export function Tile({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="tile">
      <Eyebrow as="p">{title}</Eyebrow>
      {children}
    </section>
  )
}

export function TileSkeleton({ title }: { title: string }) {
  return (
    <Tile title={title}>
      <Skeleton variant="text" lines={3} />
    </Tile>
  )
}

export function AboutTile({ actor }: { actor: ActorDetail }) {
  const text = actor.longDescription ?? actor.description
  return (
    <Tile title="About">
      {text ? (
        <Text relaxed className="prewrap">
          {text}
        </Text>
      ) : (
        <Text tone="muted">No description yet.</Text>
      )}
      {(actor.organizationTypes.length > 0 || actor.foundedDate) && (
        <div className="meta">
          {actor.organizationTypes.map((type) => (
            <Badge key={type} variant="tag">
              {type}
            </Badge>
          ))}
          {actor.foundedDate && (
            <Text as="span" size="micro" tone="muted">
              Founded {actor.foundedDate}
            </Text>
          )}
        </div>
      )}
      {actor.urls.length > 0 && (
        <ul className="links">
          {actor.urls.map((url) => (
            <li key={url}>
              <a href={url} rel="noopener noreferrer" target="_blank">
                {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

export async function ActivitiesTile({ did }: { did: string }) {
  const page = await listActivitiesPage({ author: did, limit: 6 })
  return (
    <Tile title="Activities">
      <ActivityList
        initial={page}
        source={{ kind: "author", did }}
        showAuthor={false}
      />
    </Tile>
  )
}

export async function ProjectsTile({ did }: { did: string }) {
  const page = await listProjectsPage({ author: did })
  return (
    <Tile title="Projects">
      {page.items.length === 0 ? (
        <EmptyState title="No projects yet" />
      ) : (
        <ul className="grid">
          {page.items.map((project) => (
            <ProjectCardView key={project.uri} project={project} />
          ))}
        </ul>
      )}
    </Tile>
  )
}

export async function BadgesTile({ did }: { did: string }) {
  const badges = await listBadgesReceived(did)
  return (
    <Tile title="Badges received">
      {badges.length === 0 ? (
        <EmptyState title="No badges yet" />
      ) : (
        <ul className="grid">
          {badges.map((badge) => (
            <BadgeCardView key={badge.uri} badge={badge} />
          ))}
        </ul>
      )}
    </Tile>
  )
}
