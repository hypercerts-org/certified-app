"use client";

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";
import { Folder, SearchX, SquareCheckBig, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Empty } from "@/components/empty";
import { type ExploreItem, ExploreItems, exploreKey } from "@/components/explore-items";
import { type ExploreKind, type ExploreState, exploreSearch } from "@/lib/explore-state";
import type { Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";

/**
 * One of Explore's lists in full, with Load more. List or gallery is read
 * from the address here, so switching it is instant: the toolbar changes the
 * address without a request (the data is the same).
 */
export function ExploreList({
  kind,
  state,
  initial,
  empty,
}: {
  kind: ExploreKind;
  state: ExploreState;
  initial: Page<ExploreItem>;
  empty: string;
}) {
  const view = useSearchParams().get("view") === "gallery" ? "gallery" : "list";
  const search = exploreSearch(state, { view: "list" });
  const nextPageUrl = useCallback(
    (cursor: string) =>
      `/api/explore${search || "?"}${search ? "&" : ""}${new URLSearchParams({ kind, cursor })}`,
    [kind, search],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(
    initial,
    nextPageUrl,
    exploreKey,
  );

  if (items.length === 0) {
    const icon = state.query
      ? SearchX
      : kind === "activities"
        ? SquareCheckBig
        : kind === "projects"
          ? Folder
          : Users;
    return <Empty icon={icon} title={empty} />;
  }
  return (
    <div className="stack">
      <ExploreItems kind={kind} items={items} view={view} />
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
