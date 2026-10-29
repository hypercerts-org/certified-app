import {
  Badge,
  EmptyState,
  Eyebrow,
  Skeleton,
  Text,
} from "@hypercerts-org/ui-react"
import {
  getAwardsIssued,
  listActivitiesPage,
  listBadgesReceived,
  listProjectsPage,
} from "@/lib/hypercerts/queries"
import type { ActorDetail } from "@/lib/hypercerts/views"
import { ActivityList } from "./activity-list"
import { AwardSubjectRow, BadgeCardView, ProjectCardView } from "./cards"
import { EmbedButton } from "./embed-button"

// Profile tiles. Each tile fetches its own data, so a page can show, hide or
// reorder tiles without the others knowing. That is the separability the
// product definition asks for, at its simplest.

// A tile with an embed page passes its path, and gets an Embed button that
// hands out the <iframe> code for it.
export function Tile({
  title,
  embedPath,
  children,
}: {
  title: string
  embedPath?: string
  children: React.ReactNode
}) {
  return (
    <section className="tile">
      <div className="tile-header">
        <Eyebrow as="p">{title}</Eyebrow>
        {embedPath && <EmbedButton path={embedPath} title={title} />}
      </div>
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
    <Tile
      title="Activities"
      embedPath={`/embed/activities?${new URLSearchParams({ author: did })}`}
    >
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

// Badge awards this account has issued, grouped by badge definition, with the
// most recent recipients of each. Counts are award records; the tile does not
// say what the badges mean.
export async function BadgesAwardedTile({ did }: { did: string }) {
  const issued = await getAwardsIssued(did)
  if (!issued) return null
  return (
    <Tile title="Badges awarded">
      <Text size="body-sm" tone="muted">
        {issued.awardCount} badge awards
        {issued.truncated ? " (the most recent only)" : ""}
      </Text>
      {issued.badges.map((badge) => (
        <div key={badge.uri} className="issued-badge">
          <div className="issued-badge-header">
            <Text as="span" tone="ink">
              {badge.title}
            </Text>
            {badge.badgeType && <Badge variant="tag">{badge.badgeType}</Badge>}
            <Text as="span" size="micro" tone="muted">
              {badge.awardCount} {badge.awardCount === 1 ? "award" : "awards"}
              {badge.definedBy &&
                ` · badge defined by ${badge.definedBy.displayName}`}
            </Text>
          </div>
          <ul className="award-subjects">
            {badge.recentAwards.map((award) => (
              <AwardSubjectRow key={award.uri} subject={award.subject} />
            ))}
          </ul>
          {badge.awardCount > badge.recentAwards.length && (
            <Text size="micro" tone="muted">
              and {badge.awardCount - badge.recentAwards.length} more awards
            </Text>
          )}
        </div>
      ))}
    </Tile>
  )
}
