"use client";

import { Button, EmptyState, ErrorMessage } from "@hypercerts-org/ui-react";
import { useCallback } from "react";
import type { ActorCard, Page } from "@/lib/hypercerts/views";
import { useCursorPages } from "@/lib/use-cursor-pages";
import { ActorCardView } from "./cards";

// Actors are identified by DID.
const actorKey = (actor: ActorCard) => actor.did;

export function OrganizationList({ initial, query }: { initial: Page<ActorCard>; query: string }) {
  const nextPageUrl = useCallback(
    (cursor: string) =>
      `/api/organizations?${new URLSearchParams({ cursor, ...(query ? { q: query } : {}) })}`,
    [query],
  );
  const { items, hasMore, loading, error, loadMore } = useCursorPages(
    initial,
    nextPageUrl,
    actorKey,
  );

  if (items.length === 0) {
    return (
      <EmptyState title={query ? `No organizations match "${query}"` : "No organizations yet"} />
    );
  }

  return (
    <div className="stack">
      <ul className="grid">
        {items.map((actor) => (
          <ActorCardView key={actor.did} actor={actor} />
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
