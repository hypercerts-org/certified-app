// A list's items as rows, each as what it points to: an account (avatar,
// name, handle), a project or an activity (picture, title, author), or an
// endorsement (who endorsed whom). Plain view models only: the rows also
// render in the browser, for "Load more" and the workspace's selection.

import { Skeleton, Text } from "@hypercerts-org/ui-react";
import { ArrowRight, Folder, SquareCheckBig } from "lucide-react";
import type { ReactNode } from "react";
import { ActorAvatar, ActorHandle, ActorName } from "@/components/actor";
import { activityHref, actorHref, projectHref, skeletonSlots } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import type { ActorCard, ListItem } from "@/lib/hypercerts/views";

export function Thumb({ src, project }: { src: string | null; project: boolean }) {
  return (
    <span className="list-item-thumb">
      {src ? (
        // biome-ignore lint/performance/noImgElement: indexed images come from many hosts
        <img src={src} alt="" loading="lazy" />
      ) : project ? (
        <Folder size={16} aria-hidden />
      ) : (
        <SquareCheckBig size={16} aria-hidden />
      )}
    </span>
  );
}

export function Who({ actor }: { actor: ActorCard }) {
  return (
    <IntentLink href={actorHref(actor)} className="list-item-who">
      <ActorAvatar actor={actor} size="sm" />
      <ActorName actor={actor} />
    </IntentLink>
  );
}

/** One item's content (no row of its own: the caller adds the row and a checkbox). */
export function ListItemContent({ item }: { item: ListItem }) {
  switch (item.kind) {
    case "account":
      return (
        <IntentLink href={actorHref(item.actor)} className="list-item-main">
          <ActorAvatar actor={item.actor} />
          <span className="list-item-text">
            <ActorName actor={item.actor} className="list-item-title" />
            <ActorHandle actor={item.actor} className="list-item-meta" />
          </span>
        </IntentLink>
      );
    case "project":
      return (
        <>
          <span className="list-item-main">
            <Thumb src={item.project.imageUrl} project />
            <span className="list-item-text">
              <IntentLink href={projectHref(item.project)} className="list-item-title" dir="auto">
                {item.project.title}
              </IntentLink>
              <span className="list-item-meta">
                {item.project.activityCount === 1
                  ? "1 activity"
                  : `${item.project.activityCount} activities`}
              </span>
            </span>
          </span>
          {item.author && <Who actor={item.author} />}
        </>
      );
    case "activity":
      return (
        <>
          <span className="list-item-main">
            <Thumb src={item.activity.imageUrl} project={false} />
            <span className="list-item-text">
              <IntentLink
                href={activityHref(item.activity.uri)}
                className="list-item-title"
                dir="auto"
              >
                {item.activity.title}
              </IntentLink>
              {(item.activity.period ?? item.activity.createdAt) && (
                <span className="list-item-meta">
                  {item.activity.period ?? item.activity.createdAt}
                </span>
              )}
            </span>
          </span>
          <Who actor={item.activity.author} />
        </>
      );
    case "endorsement":
      return (
        <span className="list-item-main list-item-endorsement">
          <Who actor={item.issuer} />
          <ArrowRight size={16} aria-label="endorsed" />
          {item.subject ? <Who actor={item.subject} /> : <span>an account</span>}
          {item.date && <span className="list-item-meta">{item.date}</span>}
        </span>
      );
    case "missing":
      return (
        <Text as="span" size="body-sm" tone="muted">
          A record that's no longer available
        </Text>
      );
  }
}

/** Items as rows; `start` adds something before each (the workspace's checkbox). */
export function ListItemRows({
  items,
  start,
}: {
  items: ListItem[];
  start?: (item: ListItem) => ReactNode;
}) {
  return (
    <ul className="list-items">
      {items.map((item) => (
        <li key={item.uri} className="list-item">
          {start?.(item)}
          <ListItemContent item={item} />
        </li>
      ))}
    </ul>
  );
}

/** Item rows on their way. */
export function ListItemsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="list-items" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="list-item">
          <div className="skeleton-identity">
            <Skeleton variant="box" className="skeleton-person-avatar" />
            <Skeleton variant="text" lines={2} className="overview-row-text" />
          </div>
        </div>
      ))}
    </div>
  );
}
