"use client";

// A list's items in the workspace, to pick some and remove them: a checkbox
// per item, Select all, and Remove selected. More items load a page at a time,
// as on the profile.

import { Button, Checkbox, ErrorMessage } from "@hypercerts-org/ui-react";
import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { Empty } from "@/components/empty";
import { ListItemRows } from "@/components/list-items";
import * as listActions from "@/lib/hypercerts/list-actions";
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

export function ManageListItems({
  repo,
  rkey,
  list,
  initial,
}: {
  repo: string;
  rkey: string;
  list: string;
  initial: Page<ListItem>;
}) {
  const router = useRouter();
  const pageUrl = useCallback(
    (cursor: string) => `/api/lists/items?${new URLSearchParams({ list, cursor })}`,
    [list],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, pageUrl, itemKey);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [removing, startTransition] = useTransition();

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

  const removeSelected = () => {
    if (removing || selected.size === 0) return;
    const uris = [...selected];
    startTransition(async () => {
      const result = await listActions.removeListItems(repo, rkey, uris).catch(() => ({
        ok: false as const,
        message: "We couldn't confirm whether items were removed. Reload to check.",
      }));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSelected(new Set());
      toast(result.removed === 1 ? "Removed 1 item" : `Removed ${result.removed} items`);
      router.refresh();
    });
  };

  return (
    <div className="stack">
      <div className="manage-list-bar">
        <Checkbox
          label={all ? "All selected" : "Select all"}
          checked={all}
          disabled={removing}
          onChange={(event) =>
            setSelected(event.currentTarget.checked ? new Set(items.map(itemKey)) : new Set())
          }
        />
        <Button
          variant="secondary"
          size="sm"
          loading={removing}
          disabled={selected.size === 0}
          onClick={removeSelected}
        >
          {selected.size > 0 ? `Remove selected (${selected.size})` : "Remove selected"}
        </Button>
      </div>
      <ListItemRows
        items={items}
        start={(item) => (
          <Checkbox
            label={<span className="visually-hidden">Select {itemName(item)}</span>}
            checked={selected.has(item.uri)}
            disabled={removing}
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
