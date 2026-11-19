"use client";

import { Button, EmptyState, ErrorMessage } from "@hypercerts-org/ui-react";
import { useCallback } from "react";
import type { ActivityCard, Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";
import { ActivityCardView, ActivityPostView } from "./cards";

export type ActivitySource = { kind: "author"; did: string } | { kind: "project"; uri: string };

function pageUrl(source: ActivitySource, cursor: string) {
  const params = new URLSearchParams({ cursor });
  if (source.kind === "author") params.set("author", source.did);
  else params.set("project", source.uri);
  return `/api/activities?${params}`;
}

const activityKey = (activity: ActivityCard) => activity.uri;

export function ActivityList({
  initial,
  source,
  showAuthor = true,
  variant = "cards",
  ownerDid,
}: {
  initial: Page<ActivityCard>;
  source: ActivitySource;
  showAuthor?: boolean;
  /** "posts": one under another, like a blog's list (a project's activities). */
  variant?: "cards" | "posts";
  /** As posts: whose page this is (its own activities don't name their author). */
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
  if (items.length === 0 && !hasMore) return <EmptyState title="No activities yet" />;

  return (
    <div className="stack">
      {items.length > 0 && variant === "posts" && (
        <ul className="posts">
          {items.map((activity) => (
            <ActivityPostView key={activity.uri} activity={activity} ownerDid={ownerDid} />
          ))}
        </ul>
      )}
      {items.length > 0 && variant === "cards" && (
        <ul className="work-grid">
          {items.map((activity) => (
            <ActivityCardView key={activity.uri} activity={activity} showAuthor={showAuthor} />
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
