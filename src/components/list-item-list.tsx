"use client";

// A list's items, a page at a time: the first rendered on the server, the
// rest loaded with "Load more" from /api/lists/items.

import { Button, EmptyState, ErrorMessage } from "@hypercerts-org/ui-react";
import { List } from "lucide-react";
import { useCallback } from "react";
import { ListItemRows } from "@/components/list-items";
import type { ListItem, Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

const itemKey = (item: ListItem) => item.uri;

export function ListItemList({ list, initial }: { list: string; initial: Page<ListItem> }) {
  const pageUrl = useCallback(
    (cursor: string) => `/api/lists/items?${new URLSearchParams({ list, cursor })}`,
    [list],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, pageUrl, itemKey);
  if (items.length === 0 && !hasMore) {
    return (
      <EmptyState
        icon={<List size={40} strokeWidth={1.25} aria-hidden />}
        title="No items yet"
        description="This list is empty."
      />
    );
  }
  return (
    <div className="stack">
      <ListItemRows items={items} />
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
