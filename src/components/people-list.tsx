import { Skeleton, Text } from "@hypercerts-org/ui-react";
import { type LucideIcon, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ActorRow } from "@/components/actor";
import { actorHref, skeletonSlots } from "@/components/cards";
import { Empty } from "@/components/empty";
import type { PeoplePage } from "@/lib/hypercerts/queries";
import { endorsementLine, type PersonRow } from "@/lib/hypercerts/views";

/** One account's row: avatar, name and a line under it; its date and `action` at the end. */
export function PersonRowItem({ row, action }: { row: PersonRow; action?: ReactNode }) {
  return (
    <li className="people-row">
      <ActorRow actor={row.actor} href={actorHref(row.actor)} secondary={endorsementLine(row)} />
      {(row.date || action) && (
        <span className="people-row-end">
          {row.date && <RowDate date={row.date} />}
          {action}
        </span>
      )}
    </li>
  );
}

/** A row's date, at its end. */
export function RowDate({ date }: { date: string }) {
  return (
    <Text as="span" size="body-sm" tone="muted" className="people-date">
      {date}
    </Text>
  );
}

/**
 * The rows themselves: also rendered in the browser, for lists that load
 * more (badge-holders.tsx), so they take only plain view models.
 */
export function PeopleRows({
  rows,
  action,
}: {
  rows: PersonRow[];
  /** Something at each row's end, after its date (an Unfollow button). */
  action?: (row: PersonRow) => ReactNode;
}) {
  return (
    <ul className="people-list">
      {rows.map((row) => (
        <PersonRowItem key={row.uri} row={row} action={action?.(row)} />
      ))}
    </ul>
  );
}

/** Accounts in rows (avatar, name, a note), each with its date on the right. */
export function PeopleList({
  page,
  empty,
  icon = Users,
}: {
  page: PeoplePage;
  empty: string;
  /** The empty list's icon: people for follows, a thumbs-up for endorsements. */
  icon?: LucideIcon;
}) {
  if (page.rows.length === 0) return <Empty icon={icon} title={empty} />;
  return (
    <>
      <PeopleRows rows={page.rows} />
      {page.more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {page.rows.length}.
        </Text>
      )}
    </>
  );
}

/** Rows of accounts on their way: an avatar and a name with a line under it. */
export function PeopleListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="people-list" aria-hidden>
      {skeletonSlots(rows).map((slot) => (
        <div key={slot} className="people-row">
          <div className="skeleton-identity">
            <Skeleton variant="box" className="skeleton-person-avatar" />
            <Skeleton variant="text" lines={2} className="overview-row-text" />
          </div>
        </div>
      ))}
    </div>
  );
}
