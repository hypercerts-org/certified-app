"use client"

import { Button, EmptyState, ErrorMessage } from "@hypercerts-org/ui-react"
import { useCallback } from "react"
import type { ActivityCard, Page } from "@/lib/hypercerts/views"
import { useCursorPages } from "@/lib/use-cursor-pages"
import { ActivityCardView } from "./cards"

export type ActivitySource =
  | { kind: "all" }
  | { kind: "author"; did: string }
  | { kind: "project"; uri: string }
  | { kind: "network"; did: string }

function pageUrl(source: ActivitySource, cursor: string) {
  const params = new URLSearchParams({ cursor })
  if (source.kind === "author") params.set("author", source.did)
  if (source.kind === "project") params.set("project", source.uri)
  if (source.kind === "network") params.set("network", source.did)
  return `/api/activities?${params}`
}

export function ActivityList({
  initial,
  source,
  showAuthor = true,
}: {
  initial: Page<ActivityCard>
  source: ActivitySource
  showAuthor?: boolean
}) {
  const nextPageUrl = useCallback(
    (cursor: string) => pageUrl(source, cursor),
    [source],
  )
  const { items, hasMore, loading, error, loadMore } = useCursorPages(
    initial,
    nextPageUrl,
  )

  if (items.length === 0) return <EmptyState title="No activities yet" />

  return (
    <div className="stack">
      <ul className="grid">
        {items.map((activity) => (
          <ActivityCardView
            key={activity.uri}
            activity={activity}
            showAuthor={showAuthor}
          />
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
