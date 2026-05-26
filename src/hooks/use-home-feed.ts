"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchFollowerEvents,
  FollowerEventsError,
  hydrateFeedEvents,
  type FeedActor,
  type HydratedFeedEvent,
} from "@/lib/atproto/follower-events"
import { DEFAULT_HIDDEN_CERT_LABELS } from "@/lib/atproto/labels"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

export interface UseHomeFeedOptions {
  /**
   * Cert quality labels to exclude at the hydration round-trip.
   * Defaults to `DEFAULT_HIDDEN_CERT_LABELS` (draft + likely-test) so
   * the feed hides low-quality records out of the box. Caller can
   * pass any subset of the Hyperlabel tiers — the UI surfaces this
   * via the filter popover above the feed.
   */
  excludeCertLabels?: readonly string[]
}

/**
 * Discriminated union of the timeline event kinds the home feed
 * renders. Driven by magic-indexer's `followerEvents` field (issue
 * #89), which returns one paginated stream of CREATE events
 * authored by the viewer's follow set.
 *
 * The wire `FeedEvent.kind` is a string-typed open union (a new
 * server-side kind may ship before the client updates). At this
 * layer we narrow to a closed set: known kinds become specific
 * variants below; unrecognised kinds become a `"unknown"` variant
 * that the renderer can fall back to a generic "actor + subjectUri"
 * card without dropping the event.
 *
 * Every variant carries:
 *   - `uri`: the source record's at:// URI (= `id` on the wire).
 *   - `actor`: DID convenience accessor (same as `actorProfile.did`).
 *   - `actorProfile`: denormalised actor profile (handle, display
 *     name, avatar CID) from the indexer. Renderers can use this
 *     directly instead of firing a per-row `useAuthorInfo` lookup.
 *   - `createdAt`: RFC3339 timestamp from the event's `sortAt`.
 */
export interface HomeFeedEventBase {
  uri: string
  actor: string
  actorProfile: FeedActor
  createdAt: string
}

export type HomeFeedEvent =
  | (HomeFeedEventBase & {
      kind: "cert.create"
      record: ActivityRecord
      /** Hyperlabel tier labels currently active on the cert. */
      labels: string[]
    })
  | (HomeFeedEventBase & {
      kind: "collection.create"
      record: CollectionRecord
    })
  | (HomeFeedEventBase & {
      kind: "endorsement.award"
      subjectDid: string
      note: string | null
    })
  | (HomeFeedEventBase & {
      kind: "legacy.endorsement"
      subjectDid: string
    })
  | (HomeFeedEventBase & {
      kind:
        | "evaluation.create"
        | "measurement.create"
        | "hyperboard.create"
        | "update.create"
      title: string | null
      subjectUri: string
      /**
       * For evaluation + measurement: the at:// URI of the cert this
       * event references (the thing being evaluated / measured).
       * Null for hyperboard and update events whose lexicons don't
       * carry a target reference. The renderer uses this to make the
       * "X added a measurement to <cert>" link clickable.
       */
      targetUri: string | null
    })
  | (HomeFeedEventBase & {
      kind: "unknown"
      rawKind: string
      subjectUri: string
    })

const PAGE_SIZE = 25

interface State {
  events: HomeFeedEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  cursor: string | null
  error: string | null
}

const EMPTY_STATE: State = {
  events: [],
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  cursor: null,
  error: null,
}

/**
 * Aggregator hook that powers the home page's activity feed.
 *
 * Internally:
 *   - One round-trip to `followerEvents` (the union of CREATE
 *     events across the follow set, sorted server-side by createdAt
 *     — see magic-indexer#136 for why this matches the rendered
 *     "X ago" order).
 *   - One follow-up round-trip to `HydrateFeedPage` to pull the
 *     headline payload (title, image, banner, subject DID, etc.)
 *     for each event whose kind needs more than the actor + verb.
 *
 * Pagination is intentionally absent in this first cut: the visible
 * cap is `DISPLAY_CAP`, and the home page composition only allots
 * room for one screen of activity. Adding `loadMore` is mechanical
 * once the surface needs it — see `useFollowerEventsFeed` for the
 * shape.
 */
export function useHomeFeed(
  followedDids: Set<string>,
  options: UseHomeFeedOptions = {},
) {
  const [state, setState] = useState<State>(EMPTY_STATE)
  const { excludeCertLabels = DEFAULT_HIDDEN_CERT_LABELS } = options

  // Stable string key — parent useMemo of `followedDids` recomputes
  // a new Set instance whenever the union recomputes; we don't want
  // that to refire the fetch.
  const followedKey = useMemo(() => {
    if (followedDids.size === 0) return "[]"
    return Array.from(followedDids).sort().join(",")
  }, [followedDids])

  // Stable key for the exclude-labels list — drives the refetch
  // effect below so toggling the filter re-runs the page-1 load.
  const excludeKey = useMemo(
    () => [...excludeCertLabels].sort().join(","),
    [excludeCertLabels],
  )

  // Carry the latest set into the effect closure without re-running.
  const followedRef = useRef(followedDids)
  followedRef.current = followedDids

  // Snapshot of the latest state so callbacks (loadMore) see the
  // current cursor/loading flags without re-binding on every render.
  const stateRef = useRef(state)
  stateRef.current = state

  // Snapshot the filter so the existing load() / loadMore() callbacks
  // (which deliberately have empty deps for stability) can read the
  // latest value without re-binding.
  const excludeCertLabelsRef = useRef<readonly string[]>(excludeCertLabels)
  excludeCertLabelsRef.current = excludeCertLabels

  const load = useCallback(async (signal: AbortSignal) => {
    setState((prev) => ({ ...prev, ...EMPTY_STATE, isLoading: true }))
    const authors = Array.from(followedRef.current)
    if (authors.length === 0) {
      setState({ ...EMPTY_STATE, isLoading: false })
      return
    }
    try {
      const page = await fetchFollowerEvents({
        authors,
        first: PAGE_SIZE,
        sortBy: "CREATED_AT",
        signal,
      })
      if (signal.aborted) return

      const hydrated = await hydrateFeedEvents(page.events, {
        signal,
        excludeCertLabels: excludeCertLabelsRef.current,
      })
      if (signal.aborted) return

      const events = hydrated
        .map(hydratedToHomeFeedEvent)
        .filter(passesLabelFilter)

      setState({
        events,
        isLoading: false,
        isLoadingMore: false,
        hasMore: page.hasNextPage,
        cursor: page.endCursor,
        error: null,
      })
    } catch (err) {
      if (signal.aborted) return
      console.error("[home-feed] follower-events fetch failed:", err)
      setState({
        ...EMPTY_STATE,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load feed",
      })
    }
  }, [])

  const loadMore = useCallback(() => {
    const snap = stateRef.current
    if (snap.isLoading || snap.isLoadingMore || !snap.hasMore || !snap.cursor) {
      return
    }
    const authors = Array.from(followedRef.current)
    if (authors.length === 0) return

    setState((prev) => ({ ...prev, isLoadingMore: true }))
    ;(async () => {
      try {
        const page = await fetchFollowerEvents({
          authors,
          first: PAGE_SIZE,
          after: snap.cursor ?? undefined,
          sortBy: "CREATED_AT",
        })
        const hydrated = await hydrateFeedEvents(page.events, {
          excludeCertLabels: excludeCertLabelsRef.current,
        })
        const fresh = hydrated
          .map(hydratedToHomeFeedEvent)
          .filter(passesLabelFilter)
        setState((prev) => {
          // Dedupe by URI in case the server returns overlapping
          // edges across a cursor boundary.
          const seen = new Set(prev.events.map((e) => e.uri))
          const append = fresh.filter((e) => !seen.has(e.uri))
          return {
            ...prev,
            events: [...prev.events, ...append],
            isLoadingMore: false,
            hasMore: page.hasNextPage,
            cursor: page.endCursor,
          }
        })
      } catch (err) {
        // INVALID_CURSOR: stream's sort mode changed (or the cursor
        // is otherwise stale). Drop the cursor and refetch from the
        // head — per the magic-indexer #136 / #137 contract. Keep
        // the existing list visible so the user doesn't see a flash
        // of empty state; the next page will replace it once load()
        // completes.
        if (err instanceof FollowerEventsError && err.code === "INVALID_CURSOR") {
          console.warn("[home-feed] cursor invalidated; refetching from head")
          setState((prev) => ({ ...prev, isLoadingMore: false, cursor: null }))
          const controller = new AbortController()
          void load(controller.signal)
          return
        }
        console.warn("[home-feed] loadMore failed:", err)
        // Stop offering pagination on other errors — keep the visible list.
        setState((prev) => ({ ...prev, isLoadingMore: false, hasMore: false }))
      }
    })()
  }, [load])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
    // followedKey covers follow-set changes; excludeKey covers filter
    // toggles — both should retrigger a from-the-head fetch. load is
    // stable (useCallback with []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedKey, excludeKey])

  return { ...state, loadMore }
}

/**
 * Drop events that came back as the `unknown` variant because their
 * cert was filtered out by the hydration round-trip's
 * `excludeLabels`. Without this, low-quality certs would still
 * render as a generic "X created a cert" row even though hydration
 * deliberately skipped them. Other reasons for the unknown variant
 * (404, genuinely unrecognised wire kind) still render — only the
 * specific cert.create-without-payload combination is excised.
 */
function passesLabelFilter(event: HomeFeedEvent): boolean {
  if (event.kind !== "unknown") return true
  return event.rawKind !== "cert.create"
}

/**
 * Maps a hydrated FeedEvent into the discriminated `HomeFeedEvent`
 * the renderer expects. Unknown kinds and known-kind 404s land in
 * the `"unknown"` variant so the renderer can show a generic card.
 */
function hydratedToHomeFeedEvent(h: HydratedFeedEvent): HomeFeedEvent {
  // Prefer the underlying record's `createdAt` (when the record's
  // really from). `event.sortAt` is the indexer's clock-skew-clamped
  // ordering key — fine for stable pagination, wrong for the user-
  // facing "X did Y 3h ago" timestamp because the indexer's clock
  // can lag actual publish time, making everything bunch up to
  // "indexed-at" rather than "happened-at". Fall back to sortAt only
  // when hydration didn't surface a record createdAt.
  const createdAt = recordCreatedAt(h) ?? h.event.sortAt
  const base: HomeFeedEventBase = {
    uri: h.event.id,
    actor: h.event.actor.did,
    actorProfile: h.event.actor,
    createdAt,
  }

  const payload = h.payload
  if (payload?.kind === "cert.create") {
    return { ...base, kind: "cert.create", record: payload.record, labels: payload.labels }
  }
  if (payload?.kind === "collection.create") {
    return { ...base, kind: "collection.create", record: payload.record }
  }
  if (payload?.kind === "endorsement.award") {
    return {
      ...base,
      kind: "endorsement.award",
      subjectDid: payload.subjectDid,
      note: payload.note,
    }
  }
  if (payload?.kind === "legacy.endorsement") {
    return {
      ...base,
      kind: "legacy.endorsement",
      subjectDid: payload.subjectDid,
    }
  }
  if (
    payload?.kind === "evaluation.create" ||
    payload?.kind === "measurement.create" ||
    payload?.kind === "hyperboard.create" ||
    payload?.kind === "update.create"
  ) {
    return {
      ...base,
      kind: payload.kind,
      title: payload.title,
      subjectUri: h.event.subjectUri,
      targetUri: payload.targetUri,
    }
  }

  // Either payload was null (404 hydration) or the wire `kind` was
  // outside our known set entirely. The renderer falls through to a
  // generic actor + subjectUri card.
  return {
    ...base,
    kind: "unknown",
    rawKind: h.event.kind,
    subjectUri: h.event.subjectUri,
  }
}

/**
 * Extract the source-record `createdAt` from a hydrated event.
 * Returns null when hydration produced no payload or when the
 * payload lexicon doesn't carry a createdAt (rare; we still fall
 * back to sortAt at the call site).
 */
function recordCreatedAt(h: HydratedFeedEvent): string | null {
  const p = h.payload
  if (!p) return null
  if (p.kind === "cert.create" || p.kind === "collection.create") {
    const t = p.record.value.createdAt
    return typeof t === "string" && t.length > 0 ? t : null
  }
  // endorsement.award / legacy.endorsement / evaluation / measurement
  // / hyperboard / update — `createdAt` is directly on the payload
  // (populated from the indexer's per-record createdAt field).
  return p.createdAt
}
