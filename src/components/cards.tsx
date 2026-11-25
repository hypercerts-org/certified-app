import { Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Folder } from "lucide-react";
import type { ReactNode } from "react";
import { ActorHandle, ActorLink, ActorRow, actorHref } from "@/components/actor";
import { IntentLink } from "@/components/intent-link";
import { activityMeta, projectMeta } from "@/components/records";
import type { ActivityCard, ActorCard, ProjectCard } from "@/lib/hypercerts/views";
import { activityHref, projectHref } from "@/lib/routes";

// Presentational cards. They render the same on the server (first page) and on
// the client (pages loaded later), so they take only plain view models.

// An account's profile address lives with the account components; pure route
// helpers live in src/lib/routes.ts so Server Actions don't import UI modules.
export { actorHref } from "@/components/actor";
export {
  activityHref,
  badgeHref,
  projectHref,
  WORKSPACE_OVERVIEW_PATH,
  WORKSPACE_PATH,
  workspaceHref,
  workspaceSection,
} from "@/lib/routes";

/**
 * A project as a card: its picture (or a folder), its title, its short
 * description (else how many activities it holds); its author above it where
 * the list mixes authors (`author`), and anything else under it (`footer`).
 * The whole card leads to the project.
 */
export function ProjectCardView({
  project,
  author,
  footer,
}: {
  project: ProjectCard;
  author?: ActorCard;
  footer?: ReactNode;
}) {
  return (
    <li className="project-card">
      {author && (
        <ActorRow
          actor={author}
          href={actorHref(author)}
          size="sm"
          secondary={<ActorHandle actor={author} />}
        />
      )}
      <div className="project-card-image">
        {project.imageUrl ? (
          // biome-ignore lint/performance/noImgElement: indexed images come from many hosts
          <img src={project.imageUrl} alt="" loading="lazy" />
        ) : (
          <Folder size={32} strokeWidth={1.25} aria-hidden />
        )}
      </div>
      <Heading level={3} size="heading" className="project-card-title">
        <IntentLink href={projectHref(project)} className="card-link" dir="auto">
          {project.title}
        </IntentLink>
      </Heading>
      <Text size="body-sm" tone="muted" className="clamp" dir="auto">
        {project.summary ?? projectMeta(project)}
      </Text>
      {footer}
    </li>
  );
}

/** Project cards on their way: a picture and a title each. */
export function ProjectCardsSkeleton({
  count = 4,
  author = false,
}: {
  count?: number;
  author?: boolean;
}) {
  return (
    <div className="card-gallery" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <div key={slot} className="project-card">
          {author && <Skeleton variant="line" className="skeleton-card-meta" />}
          <Skeleton variant="box" className="project-card-image" />
          <Skeleton variant="line" className="skeleton-card-title" />
        </div>
      ))}
    </div>
  );
}

/** Keys for n placeholders of a skeleton, which have no identity of their own. */
export const skeletonSlots = (n: number) => Array.from({ length: n }, (_, i) => `slot-${i}`);

/**
 * An activity as a post, like a blog's: its title, the start of its text,
 * its meta line (as its row has it) and its author when not the page's own
 * account (`ownerDid`), its picture beside them. Activities are often updates
 * to a project, so this is how a list of them reads everywhere. The whole
 * post leads to the activity.
 */
export function ActivityPost({
  activity,
  ownerDid,
}: {
  activity: ActivityCard;
  ownerDid?: string;
}) {
  const meta = activityMeta(activity);
  const byOther = activity.author.did !== ownerDid;
  return (
    <li className="post">
      <div className="post-text">
        <Heading level={2} size="heading">
          <IntentLink href={activityHref(activity.uri)} className="card-link" dir="auto">
            {activity.title}
          </IntentLink>
        </Heading>
        {activity.summary && (
          <Text className="post-excerpt" dir="auto">
            {activity.summary}
          </Text>
        )}
        {(meta || byOther) && (
          <Text as="p" size="body-sm" tone="muted" className="post-meta">
            {meta}
            {byOther && (
              <>
                {meta && " · "}
                by <ActorLink actor={activity.author} avatar={false} />
              </>
            )}
          </Text>
        )}
      </div>
      {activity.imageUrl && (
        <div className="post-image">
          {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
          <img src={activity.imageUrl} alt="" loading="lazy" />
        </div>
      )}
    </li>
  );
}

/** Posts on their way: a title, lines of text, and a picture beside them. */
export function ActivityPostsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="posts divided" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <div key={slot} className="post">
          <div className="post-text">
            <Skeleton variant="line" className="skeleton-card-title" />
            <Skeleton variant="text" lines={3} />
          </div>
          <Skeleton variant="box" className="post-image" />
        </div>
      ))}
    </div>
  );
}
