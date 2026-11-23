// A list's items as rows, each as what it points to: an account (avatar,
// name, handle), a project or an activity (picture, title, author), or an
// endorsement (who endorsed whom). Plain view models only: the rows also
// render in the browser, for "Load more" and the workspace's selection.

import { Skeleton, Text } from "@hypercerts-org/ui-react";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ActorAvatar, ActorHandle, ActorLink, ActorName } from "@/components/actor";
import { actorHref, skeletonSlots } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import { ActivityRow, ProjectRow } from "@/components/records";
import type { ListItem } from "@/lib/hypercerts/views";

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
        <ProjectRow
          project={item.project}
          end={item.author && <ActorLink actor={item.author} className="list-item-who" />}
        />
      );
    case "activity":
      return (
        <ActivityRow
          activity={item.activity}
          end={<ActorLink actor={item.activity.author} className="list-item-who" />}
        />
      );
    case "endorsement":
      return (
        <span className="list-item-main list-item-endorsement">
          <ActorLink actor={item.issuer} className="list-item-who" />
          <ArrowRight size={16} aria-label="endorsed" />
          {item.subject ? (
            <ActorLink actor={item.subject} className="list-item-who" />
          ) : (
            <span>an account</span>
          )}
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
