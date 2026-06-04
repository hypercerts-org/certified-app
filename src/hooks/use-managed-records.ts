"use client"

import { useMemo } from "react"
import type { CollectionRecord } from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { OwnerTag } from "@/lib/atproto/owner-tag"
import { useManagedProjects } from "./use-managed-projects"
import { useManagedActivities } from "./use-managed-activities"

/**
 * A single row in the merged managed feed: either a project collection
 * record or an activity claim, carrying its provenance `OwnerTag` and a
 * `kind` discriminator so consumers can render the right card without
 * re-parsing the record.
 */
export type ManagedItem =
  | { kind: "project"; uri: string; record: CollectionRecord; owner: OwnerTag; sortKey: string }
  | { kind: "activity"; uri: string; record: ActivityRecord; owner: OwnerTag; sortKey: string }

export interface ManagedRecordsResult {
  items: ManagedItem[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

/**
 * Recency sort key. Prefer the record's authored `createdAt`; fall back
 * to the empty string (sorts last) when neither is present. Projects
 * and activities both expose `value.createdAt`.
 */
function projectSortKey(record: CollectionRecord): string {
  return typeof record.value.createdAt === "string" ? record.value.createdAt : ""
}

function activitySortKey(record: ActivityRecord): string {
  return record.value.createdAt || ""
}

/**
 * The unified managed feed: projects + activities authored by the
 * viewer's managed identities (personal + owned/admin groups), merged
 * and sorted newest-first by `createdAt`.
 *
 * Each item carries its `OwnerTag` and a `kind` so the consuming surface
 * can branch on render.
 *
 * Union-pagination caveat: projects and activities paginate on
 * independent cursors (two indexer ops, two `endCursor`s). `loadMore`
 * advances BOTH underlying feeds a page, and `hasMore` is the OR of the
 * two. Because each source is independently newest-first but they're
 * interleaved by `createdAt`, the merged list is only globally sorted
 * within the pages fetched so far — a later page of one source can
 * surface a record older than items already shown from the other
 * source. This is acceptable for a "your recent work" feed; a strict
 * global ordering would require a unified server-side cursor the indexer
 * doesn't expose.
 */
export function useManagedRecords(): ManagedRecordsResult {
  const projects = useManagedProjects()
  const activities = useManagedActivities()

  const items = useMemo<ManagedItem[]>(() => {
    const merged: ManagedItem[] = []
    for (const p of projects.items) {
      merged.push({
        kind: "project",
        uri: p.record.uri,
        record: p.record,
        owner: p.owner,
        sortKey: projectSortKey(p.record),
      })
    }
    for (const a of activities.items) {
      merged.push({
        kind: "activity",
        uri: a.record.uri,
        record: a.record,
        owner: a.owner,
        sortKey: activitySortKey(a.record),
      })
    }
    // Newest first. Localcompare on ISO strings is a valid recency sort.
    merged.sort((x, y) => (x.sortKey < y.sortKey ? 1 : x.sortKey > y.sortKey ? -1 : 0))
    return merged
  }, [projects.items, activities.items])

  const loadMore = () => {
    // Advance both sources; each no-ops if it has no more / is in flight.
    projects.loadMore()
    activities.loadMore()
  }

  return {
    items,
    isLoading: projects.isLoading || activities.isLoading,
    isLoadingMore: projects.isLoadingMore || activities.isLoadingMore,
    error: projects.error ?? activities.error,
    hasMore: projects.hasMore || activities.hasMore,
    loadMore,
  }
}
