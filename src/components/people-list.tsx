import { EmptyState, IdentityRow, Text } from "@hypercerts-org/ui-react";
import { actorHref } from "@/components/cards";
import type { PeoplePage } from "@/lib/hypercerts/queries";

/** Accounts in rows (avatar, name, a note), each with its date on the right. */
export function PeopleList({ page, empty }: { page: PeoplePage; empty: string }) {
  if (page.rows.length === 0) return <EmptyState title={empty} />;
  return (
    <>
      <ul className="people-list">
        {page.rows.map((row) => (
          <li key={row.uri} className="people-row">
            <IdentityRow
              name={row.actor.displayName}
              avatarSrc={row.actor.avatarUrl}
              href={actorHref(row.actor)}
              secondary={row.note ?? undefined}
            />
            {row.date && (
              <Text as="span" size="body-sm" tone="muted" className="people-date">
                {row.date}
              </Text>
            )}
          </li>
        ))}
      </ul>
      {page.more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {page.rows.length}.
        </Text>
      )}
    </>
  );
}
