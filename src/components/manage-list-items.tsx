"use client";

// A list's items in the workspace, to pick some and remove them: a checkbox
// per item, Select all, and Remove selected. Picking works now; removing
// comes with the Hypercerts SDK's writes (a placeholder until then). More
// items load a page at a time, as on the profile.

import { Button, Checkbox, ErrorMessage } from "@hypercerts-org/ui-react";
import { ListChecks } from "lucide-react";
import { useCallback, useState } from "react";
import { ComingSoonButton } from "@/components/coming-soon";
import { Empty } from "@/components/empty";
import { ListItemRows } from "@/components/list-items";
import type { ListItem, Page } from "@/lib/hypercerts/views";
import { nameOf } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

const itemKey = (item: ListItem) => item.uri;

/** What a checkbox calls an item, for screen readers. */
function itemName(item: ListItem): string {
  switch (item.kind) {
    case "account":
      return nameOf(item.actor);
    case "project":
      return item.project.title;
    case "activity":
      return item.activity.title;
    case "endorsement":
      return `${nameOf(item.issuer)}'s endorsement`;
    case "missing":
      return "an unavailable record";
  }
}

export function ManageListItems({ list, initial }: { list: string; initial: Page<ListItem> }) {
  const pageUrl = useCallback(
    (cursor: string) => `/api/lists/items?${new URLSearchParams({ list, cursor })}`,
    [list],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, pageUrl, itemKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  if (items.length === 0 && !hasMore) {
    return (
      <Empty
        icon={ListChecks}
        title="No items yet"
        description="Add items to this list with Add items."
      />
    );
  }

  const all = items.length > 0 && items.every((item) => selected.has(item.uri));
  const toggle = (uri: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(uri);
      else next.delete(uri);
      return next;
    });

  return (
    <div className="stack">
      <div className="manage-list-bar">
        <Checkbox
          label={all ? "All selected" : "Select all"}
          checked={all}
          onChange={(event) =>
            setSelected(event.currentTarget.checked ? new Set(items.map(itemKey)) : new Set())
          }
        />
        <ComingSoonButton>
          {selected.size > 0 ? `Remove selected (${selected.size})` : "Remove selected"}
        </ComingSoonButton>
      </div>
      <ListItemRows
        items={items}
        start={(item) => (
          <Checkbox
            label={<span className="visually-hidden">Select {itemName(item)}</span>}
            checked={selected.has(item.uri)}
            onChange={(event) => toggle(item.uri, event.currentTarget.checked)}
          />
        )}
      />
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
