"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { fetchIndexerActivities } from "@/lib/atproto/indexer"
import {
  ALL_LABELS,
  DEFAULT_SELECTED_FILTERS,
  pickKnownLabel,
  type FilterValue,
  type LabelValue,
} from "@/lib/atproto/labeller"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

const PAGE_SIZE = 50

/**
 * useGlobalFeed pulls the global activity feed from the Magic Indexer.
 *
 * The previous implementation made two parallel API calls — one to
 * the indexer for records, one to the labeller for labels — and
 * joined them in memory. Magic Indexer ships labels inline on
 * every record so this hook now makes a single GraphQL call.
 *
 * Filter pushdown rules:
 *
 *   - When the user's selected filters consist entirely of label
 *     values (no "unlabelled"), the indexer applies the filter
 *     server-side via the `labels` arg and returns only matching
 *     records. The hook does no client-side filtering.
 *
 *   - When "unlabelled" is in the selected filters, the indexer
 *     cannot push the filter down (there's no "include records
 *     with no labels" option), so the hook fetches without a
 *     server-side label filter and applies the filter client-side
 *     against the inline `labels` field on each record. This is
 *     still cheap because labels are already on the record — no
 *     second round trip.
 *
 * The previous MIN_VISIBLE auto-pagination loop is gone: in the
 * server-pushdown path it's unnecessary, and in the unlabelled
 * path the client-side filter is local enough that the user can
 * just click "Load more" if they want more results.
 */
export interface UseGlobalFeedOptions {
  /**
   * When provided, only records published by a DID in this set are
   * returned (server-side). Pass undefined to skip the author filter.
   * An empty set is load-bearing: it means "match nothing" and the
   * backend returns zero results.
   */
  endorsedDids?: Set<string>
}

export function useGlobalFeed(options: UseGlobalFeedOptions = {}) {
  const { endorsedDids } = options
  const endorsedDidsRef = useRef(endorsedDids)
  endorsedDidsRef.current = endorsedDids
  const [allActivities, setAllActivities] = useState<ActivityRecord[]>([])
  const [dids, setDids] = useState<Map<string, string>>(new Map())
  const [labels, setLabels] = useState<Map<string, LabelValue>>(new Map())
  const [selectedLabels, setSelectedLabels] = useState<FilterValue[]>(DEFAULT_SELECTED_FILTERS)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const endCursorRef = useRef<string | null>(null)
  const isLoadingMoreRef = useRef(false)

  /**
   * Resolve the selected filter list to a stable string key
   * representing the server-side label include filter, or "" if
   * the filter cannot be pushed down (because "unlabelled" is in
   * the mix, or because every known label value is selected — in
   * either case there's nothing to push down).
   *
   * We derive a *string* (not an array) so the effect dependency
   * stays primitive: toggling "unlabelled" (a purely client-side
   * concern) doesn't change this key, so the effect doesn't fire
   * an unnecessary network refetch. See `rerender-dependencies`.
   */
  const serverLabelFilterKey = useMemo<string>(() => {
    if (selectedLabels.includes("unlabelled")) return ""
    const valueLabels = selectedLabels
      .filter((l): l is LabelValue => l !== "unlabelled")
      .slice()
      .sort()
    if (valueLabels.length === 0) return ""
    if (valueLabels.length === ALL_LABELS.length) return ""
    return valueLabels.join(",")
  }, [selectedLabels])

  /**
   * Stable string key for the server-side authors filter. Same
   * principle as serverLabelFilterKey: a primitive dependency so the
   * effect fires only when the actual filter shape changes.
   *
   * undefined endorsedDids => "" (no author filter).
   * empty Set => "[]" (explicit "match nothing").
   * non-empty Set => sorted, joined DIDs.
   */
  const serverAuthorsFilterKey = useMemo<string>(() => {
    if (!endorsedDids) return ""
    if (endorsedDids.size === 0) return "[]"
    return Array.from(endorsedDids).sort().join(",")
  }, [endorsedDids])

  const combinedServerFilterKey = `${serverLabelFilterKey}|${serverAuthorsFilterKey}`

  const ingestPage = useCallback(
    (data: Awaited<ReturnType<typeof fetchIndexerActivities>>, append: boolean) => {
      setAllActivities(prev => (append ? [...prev, ...data.records] : data.records))
      setDids(prev => {
        const next = append ? new Map(prev) : new Map<string, string>()
        data.dids.forEach((did, uri) => next.set(uri, did))
        return next
      })
      setLabels(prev => {
        const next = append ? new Map(prev) : new Map<string, LabelValue>()
        data.labels.forEach((labelValues, uri) => {
          const known = pickKnownLabel(labelValues)
          if (known !== undefined) {
            next.set(uri, known)
          } else if (append) {
            // On append, drop any previous label assertion that the
            // new page no longer carries (e.g. label was negated).
            next.delete(uri)
          }
        })
        return next
      })
      endCursorRef.current = data.endCursor
      setHasMore(data.hasMore)
    },
    [],
  )

  const loadInitial = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true)
        setError(null)
        const labelsArg =
          serverLabelFilterKey === ""
            ? undefined
            : (serverLabelFilterKey.split(",") as LabelValue[])
        const data = await fetchIndexerActivities({
          first: PAGE_SIZE,
          labels: labelsArg,
          authors: endorsedDidsRef.current ? Array.from(endorsedDidsRef.current) : undefined,
          signal,
        })
        if (signal?.aborted) return
        ingestPage(data, false)
      } catch (err) {
        if (signal?.aborted) return
        console.error("Failed to fetch global feed:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch feed")
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [ingestPage, combinedServerFilterKey], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Refetch whenever the server-side filter shape changes. The
  // client-only filter changes (toggling "unlabelled") just
  // re-derive the visible list locally and don't re-issue.
  useEffect(() => {
    const controller = new AbortController()
    loadInitial(controller.signal)
    return () => controller.abort()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (!endCursorRef.current || isLoadingMoreRef.current) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const labelsArg =
        serverLabelFilterKey === ""
          ? undefined
          : (serverLabelFilterKey.split(",") as LabelValue[])
      const data = await fetchIndexerActivities({
        first: PAGE_SIZE,
        after: endCursorRef.current,
        labels: labelsArg,
        authors: endorsedDidsRef.current ? Array.from(endorsedDidsRef.current) : undefined,
      })
      ingestPage(data, true)
    } catch (err) {
      console.error("Failed to load more:", err)
      // Stop offering pagination on error (e.g. invalid cursor returns 400)
      setHasMore(false)
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [ingestPage, combinedServerFilterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Visible list = client-side application of the full filter set.
  // When the server already pre-filtered (serverLabelFilter !== undefined)
  // and "unlabelled" is not selected, every record from the indexer is
  // already a match — but we still apply the local filter to handle
  // races where the user toggles the filter mid-fetch.
  const activities = useMemo(() => {
    return allActivities.filter(record => {
      const label = labels.get(record.uri)
      if (!label) return selectedLabels.includes("unlabelled")
      return selectedLabels.includes(label)
    })
  }, [allActivities, labels, selectedLabels])

  return {
    activities,
    dids,
    labels,
    selectedLabels,
    setSelectedLabels,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}
