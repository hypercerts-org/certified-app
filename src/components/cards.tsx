import { Avatar, Card, Heading, IdentityRow, Skeleton, Text } from "@hypercerts-org/ui-react";
import { IntentLink } from "@/components/intent-link";
import type { ActivityCard, ActorCard, ProjectCard } from "@/lib/hypercerts/views";

// Presentational cards. They render the same on the server (first page) and on
// the client (pages loaded later), so they take only plain view models.

/**
 * An account's profile: at its handle when known (the address people share),
 * otherwise at its DID, which redirects to the handle.
 */
export function actorHref(actor: string | { did: string; handle: string | null }) {
  if (typeof actor === "string") return `/${actor}`;
  return `/${actor.handle ?? actor.did}`;
}

/** An account's workspace. */
export function workspaceHref(did: string) {
  return `/${did}/workspace`;
}

/** `/workspace`, and any account's workspace or profile editor; group 1 is the DID. */
export const WORKSPACE_PATH = /^\/(?:workspace|(did:[^/]+)\/(?:workspace|edit))(?:\/|$)/;

/** A workspace's Overview (or the profile editor, opened from it). */
export const WORKSPACE_OVERVIEW_PATH = /^\/(?:workspace|did:[^/]+\/(?:workspace|edit))\/?$/;

/** The section of a workspace a path is in ("/projects"), or "" for the Overview. */
export function workspaceSection(pathname: string): string {
  return pathname.match(/^\/did:[^/]+\/workspace(\/[^/]+)/)?.[1] ?? "";
}

export function projectHref(project: Pick<ProjectCard, "authorDid" | "rkey">) {
  return `/${project.authorDid}/project/${project.rkey}`;
}

export function ActorCardView({ actor }: { actor: ActorCard }) {
  return (
    <Card as="li" variant="panel" className="card">
      <IdentityRow
        name={actor.displayName}
        avatarSrc={actor.avatarUrl}
        href={actorHref(actor)}
        secondary={actor.isOrganization ? "Organization" : "Person"}
      />
      {actor.description && (
        <Text size="body-sm" tone="muted" className="clamp">
          {actor.description}
        </Text>
      )}
    </Card>
  );
}

/** A record's image, or nothing: cards without one stay text only. */
function CardImage({ src }: { src: string | null }) {
  if (!src) return null;
  return (
    <div className="work-card-image">
      {/* Indexed images come from many hosts: no next/image optimization. */}
      {/* biome-ignore lint/performance/noImgElement: arbitrary remote hosts */}
      <img src={src} alt="" loading="lazy" />
    </div>
  );
}

export function ActivityCardView({
  activity,
  showAuthor,
}: {
  activity: ActivityCard;
  showAuthor: boolean;
}) {
  return (
    <Card as="li" variant="panel" className="work-card">
      <div className="work-card-layout">
        <CardImage src={activity.imageUrl} />
        <div className="work-card-body">
          <Heading level={3} size="heading">
            {activity.title}
          </Heading>
          {activity.summary && (
            <Text size="body-sm" className="clamp">
              {activity.summary}
            </Text>
          )}
          <div className="meta">
            {showAuthor && (
              <IntentLink href={actorHref(activity.author)} className="meta-author">
                <Avatar
                  name={activity.author.displayName}
                  src={activity.author.avatarUrl}
                  size="sm"
                />
                <Text as="span" size="micro">
                  {activity.author.displayName}
                </Text>
              </IntentLink>
            )}
            {activity.createdAt && (
              <Text as="span" size="micro" tone="muted">
                {activity.createdAt}
              </Text>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ProjectCardView({ project }: { project: ProjectCard }) {
  return (
    <Card as="li" variant="panel" className="work-card">
      <div className="work-card-layout">
        <CardImage src={project.imageUrl} />
        <div className="work-card-body">
          <Heading level={3} size="heading">
            <IntentLink href={projectHref(project)} className="work-card-link">
              {project.title}
            </IntentLink>
          </Heading>
          <Text size="body-sm" tone="muted">
            {project.activityCount === 1 ? "1 activity" : `${project.activityCount} activities`}
          </Text>
          {project.summary && (
            <Text size="body-sm" className="clamp">
              {project.summary}
            </Text>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Keys for n placeholders of a skeleton, which have no identity of their own. */
export const skeletonSlots = (n: number) => Array.from({ length: n }, (_, i) => `slot-${i}`);

/** Activity or project cards on their way: each a card with a title and a line under it. */
export function WorkCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="work-grid" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <Card key={slot} variant="panel" className="work-card">
          <div className="work-card-body">
            <Skeleton variant="line" className="skeleton-card-title" />
            <Skeleton variant="line" className="skeleton-card-meta" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Account cards on their way: each an avatar, a name and a line under it. */
export function ActorCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <Card key={slot} variant="panel" className="card">
          <div className="skeleton-identity">
            <Skeleton variant="box" className="skeleton-person-avatar" />
            <Skeleton variant="text" lines={2} className="overview-row-text" />
          </div>
        </Card>
      ))}
    </div>
  );
}
