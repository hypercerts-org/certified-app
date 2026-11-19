"use client";

import { Award } from "lucide-react";
import { Empty } from "@/components/empty";
// A badge's holders, a page at a time: the first rendered on the server, the
// rest loaded with "Load more" from /api/badges/holders.

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";
import { useCallback } from "react";
import { PeopleRows } from "@/components/people-list";
import type { Page, PersonRow } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

const rowKey = (row: PersonRow) => row.uri;

export function BadgeHolderList({
  badge,
  response,
  initial,
  empty,
}: {
  badge: string;
  response: "accepted" | "unanswered";
  initial: Page<PersonRow>;
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
      <PeopleRows rows={items} />
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
