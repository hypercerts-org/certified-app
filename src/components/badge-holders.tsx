"use client";

// A badge's holders, a page at a time: the first rendered on the server, the
// rest loaded with "Load more" from /api/badges/holders. A holder is an
// account, or a record the badge went to (a project, an activity), each as
// the app shows it everywhere, with the award's date at the end.

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";
import { Award } from "lucide-react";
import { useCallback } from "react";
import { ActorLink } from "@/components/actor";
import { Empty } from "@/components/empty";
import { PersonRowItem, RowDate } from "@/components/people-list";
import { ActivityRow, ProjectRow } from "@/components/records";
import type { BadgeHolder } from "@/lib/hypercerts/queries";
import type { Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

const rowKey = (holder: BadgeHolder) => holder.uri;

function HolderRow({ holder }: { holder: BadgeHolder }) {
  if (holder.kind === "account") return <PersonRowItem row={holder.row} />;
  const { item, date } = holder;
  const author = item.kind === "project" ? item.author : item.activity.author;
  const end = (
    <>
      {author && <ActorLink actor={author} className="list-item-who" />}
      {date && <RowDate date={date} />}
    </>
  );
  return (
    <li className="people-row">
      {item.kind === "project" ? (
        <ProjectRow project={item.project} end={end} />
      ) : (
        <ActivityRow activity={item.activity} end={end} />
      )}
    </li>
  );
}

export function BadgeHolderList({
  badge,
  response,
  initial,
  empty,
}: {
  badge: string;
  response: "accepted" | "unanswered";
  initial: Page<BadgeHolder>;
  empty: string;
}) {
  const pageUrl = useCallback(
    (cursor: string) => `/api/badges/holders?${new URLSearchParams({ badge, response, cursor })}`,
    [badge, response],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, pageUrl, rowKey);
  if (items.length === 0 && !hasMore) return <Empty icon={Award} title={empty} />;
  return (
    <div className="stack">
      <ul className="people-list divided">
        {items.map((holder) => (
          <HolderRow key={holder.uri} holder={holder} />
        ))}
      </ul>
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
