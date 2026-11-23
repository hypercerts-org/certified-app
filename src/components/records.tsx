// A project or an activity as a row, wherever the app lists them: the
// workspace's Latest and folders, lists, Explore. One thumbnail, one title,
// one meta line (the same for a kind everywhere: an activity's dates and work
// scope, a project's activity count), and the whole row leads to the record.
// What differs between places goes in `start` (a folder's chevron) and `end`
// (the author, the age, other projects it is in).

import { Skeleton } from "@hypercerts-org/ui-react";
import { Folder, SquareCheckBig } from "lucide-react";
import type { ReactNode } from "react";
import { activityHref, projectHref } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import type { ActivityCard, ProjectCard } from "@/lib/hypercerts/views";

type Kind = "activity" | "project";

const joined = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** An activity's meta line: when the work happened (else when it was published), its scope. */
export function activityMeta(activity: ActivityCard): string {
  return joined(activity.period ?? activity.createdAt, activity.scope);
}

/** A project's meta line: how many activities it holds. */
export function projectMeta(project: Pick<ProjectCard, "activityCount">): string {
  return activityCount(project.activityCount);
}

export const activityCount = (n: number) => (n === 1 ? "1 activity" : `${n} activities`);

/** The record's picture, or its kind's icon. */
export function RecordThumb({ kind, src }: { kind: Kind; src: string | null }) {
  return (
    <span className="record-thumb">
      {src ? (
        // biome-ignore lint/performance/noImgElement: indexed images come from many hosts
        <img src={src} alt="" loading="lazy" />
      ) : kind === "project" ? (
        <Folder size={16} aria-hidden />
      ) : (
        <SquareCheckBig size={16} aria-hidden />
      )}
    </span>
  );
}

/**
 * The row itself. With `href`, the title is the link and its hit area covers
 * the row; links and buttons in `end` stay clickable on their own.
 */
export function RecordRow({
  kind,
  title,
  meta,
  imageUrl,
  href,
  start,
  end,
  className,
}: {
  kind: Kind;
  title: string;
  meta: string;
  imageUrl: string | null;
  href: string | null;
  start?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["record-row", href && "record-row-linked", className].filter(Boolean).join(" ")}
    >
      {start}
      <RecordThumb kind={kind} src={imageUrl} />
      <span className="record-row-text">
        {href ? (
          <IntentLink href={href} className="record-row-title record-row-link" dir="auto">
            {title}
          </IntentLink>
        ) : (
          <span className="record-row-title" dir="auto">
            {title}
          </span>
        )}
        {meta && <span className="record-row-meta">{meta}</span>}
      </span>
      {end && <span className="record-row-end">{end}</span>}
    </div>
  );
}

export function ActivityRow({
  activity,
  end,
  className,
}: {
  activity: ActivityCard;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <RecordRow
      kind="activity"
      title={activity.title}
      meta={activityMeta(activity)}
      imageUrl={activity.imageUrl}
      href={activityHref(activity.uri)}
      end={end}
      className={className}
    />
  );
}

/** `href` null: the row is not a link (a folder's head, which opens the folder). */
export function ProjectRow({
  project,
  href = projectHref(project),
  start,
  end,
  className,
}: {
  project: ProjectCard;
  href?: string | null;
  start?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <RecordRow
      kind="project"
      title={project.title}
      meta={projectMeta(project)}
      imageUrl={project.imageUrl}
      href={href}
      start={start}
      end={end}
      className={className}
    />
  );
}

/** A row on its way: the thumbnail and two lines. */
export function RecordRowSkeleton({ end }: { end?: ReactNode }) {
  return (
    <div className="record-row" aria-hidden>
      <Skeleton variant="box" className="record-thumb" />
      <Skeleton variant="text" lines={2} className="record-row-text" />
      {end}
    </div>
  );
}
