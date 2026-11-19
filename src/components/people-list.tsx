import { IdentityRow, Skeleton, Text } from "@hypercerts-org/ui-react";
import { Users } from "lucide-react";
import { actorHref, skeletonSlots } from "@/components/cards";
import { Empty } from "@/components/empty";
import type { PeoplePage } from "@/lib/hypercerts/queries";
import { endorsementLine, type PersonRow } from "@/lib/hypercerts/views";

/**
 * The rows themselves: also rendered in the browser, for lists that load
 * more (badge-holders.tsx), so they take only plain view models.
 */
export function PeopleRows({ rows }: { rows: PersonRow[] }) {
  return (
    <ul className="people-list">
      {rows.map((row) => (
        <li key={row.uri} className="people-row">
          <IdentityRow
            name={row.actor.displayName}
            avatarSrc={row.actor.avatarUrl}
            href={actorHref(row.actor)}
            secondary={endorsementLine(row)}
          />
          {row.date && (
            <Text as="span" size="body-sm" tone="muted" className="people-date">
              {row.date}
            </Text>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Accounts in rows (avatar, name, a note), each with its date on the right. */
export function PeopleList({ page, empty }: { page: PeoplePage; empty: string }) {
  if (page.rows.length === 0) return <Empty icon={Users} title={empty} />;
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
