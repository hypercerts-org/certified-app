"use client";

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";
import { SquareCheckBig } from "lucide-react";
import { useCallback } from "react";
import { Empty } from "@/components/empty";
import type { ActivityCard, Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";
import { ActivityPost } from "./cards";

export type ActivitySource = { kind: "author"; did: string } | { kind: "project"; uri: string };

function pageUrl(source: ActivitySource, cursor: string) {
  const params = new URLSearchParams({ cursor });
  if (source.kind === "author") params.set("author", source.did);
  else params.set("project", source.uri);
  return `/api/activities?${params}`;
}

const activityKey = (activity: ActivityCard) => activity.uri;

/** Activities as posts (ActivityPost), with Load more. */
export function ActivityList({
  initial,
  source,
  ownerDid,
}: {
  initial: Page<ActivityCard>;
  source: ActivitySource;
  /** Whose page this is: its own activities don't name their author. */
  ownerDid?: string;
}) {
  const nextPageUrl = useCallback((cursor: string) => pageUrl(source, cursor), [source]);
  const { items, hasMore, loading, error, loadMore } = useCursorPages(
    initial,
    nextPageUrl,
    activityKey,
  );

  // A project page can come back empty after filtering (collection items that
  // are not activities) while later pages still hold activities, so the empty
  // state waits for the last page.
  if (items.length === 0 && !hasMore)
    return <Empty icon={SquareCheckBig} title="No activities yet" />;

  return (
    <div className="stack">
      {items.length > 0 && (
        <ul className="posts">
          {items.map((activity) => (
            <ActivityPost key={activity.uri} activity={activity} ownerDid={ownerDid} />
          ))}
        </ul>
      )}
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {hasMore && (
        <Button variant="secondary" loading={loading} onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
