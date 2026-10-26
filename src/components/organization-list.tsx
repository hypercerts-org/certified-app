"use client"

import { useCallback } from "react"

import type { ActorCard, Page } from "@/lib/hypercerts/views"
import { useCursorPages } from "@/lib/use-cursor-pages"

import { ActorCardView } from "./cards"
import { Button, EmptyState, ErrorMessage } from "./ui"

type ActorItem = ActorCard & { uri: string }

export function OrganizationList({ initial, query }: { initial: Page<ActorCard>; query: string }) {
  // useCursorPages deduplicates by `uri`; actors are identified by DID.
  const initialItems: Page<ActorItem> = {
    items: initial.items.map((actor) => ({ ...actor, uri: actor.did })),
    cursor: initial.cursor,
  }
  const nextPageUrl = useCallback(
    (cursor: string) => `/api/organizations?${new URLSearchParams({ cursor, ...(query ? { q: query } : {}) })}`,
    [query],
  )
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initialItems, nextPageUrl)

  if (items.length === 0) {
    return <EmptyState title={query ? `No organizations match "${query}"` : "No organizations yet"} />
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
  )
}
