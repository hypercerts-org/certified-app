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
  /**
   * When set, narrow the hydration to records carrying one of these
   * labels. The home-feed quality popover uses this when the
   * "Not labeled yet" checkbox is UNCHECKED — only labelled certs
   * pass. Mutually exclusive with `excludeCertLabels`: the parent
   * picks one mode based on whether unlabeled is included.
   */
  includeCertLabels?: readonly string[]
  /**
   * Gates the initial fetch. The home page resolves direct follows
   * and trusted-evaluator-endorsed DIDs in parallel — both feed into
   * the effective author set. Setting `ready: false` while either
   * is still loading defers the fetch so the feed lands in one
   * frame instead of flashing direct-follow content first and then
   * re-rendering with the union. Default true — callers that don't
   * union multiple author sources can ignore this flag.
   */
  ready?: boolean
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
      /**
       * Folded-pair event from magic-indexer (project + cert created
       * in the same batch). Renders as a single project card with a
       * "created a project with a cert" sentence — the cert URI(s)
       * are inside `record.value.items[]` for follow-up dispatch.
       */
      kind: "project.created_with_cert"
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
       * For evaluation + measurement + update: the at:// URI of the
       * cert/project the event references (the thing being evaluated,
       * measured, or attached to). Null for hyperboard events whose
       * lexicon doesn't carry a target reference. The renderer uses
       * this to make the "X added a measurement to <cert>" /
       * "X posted an update to <Y>" tail link clickable.
       */
      targetUri: string | null
      /**
       * Kind-specific preview snippet. Today only update.create
       * populates it (from the attachment record's `shortDescription`
       * lexicon field); other kinds stay null and render with just
       * the actor + verb sentence.
       */
      shortDescription: string | null
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
 * Each page is two round-trips:
 *   - `followerEvents` returns the next page of CREATE events
 *     across the follow set, sorted server-side by `createdAt`
 *     (magic-indexer#136 — matches the rendered "X ago" order).
 *   - `HydrateFeedPage` fetches the headline payload (title,
 *     image, banner, labels, subject DID, etc.) for each event
 *     whose kind needs more than the actor + verb.
 *
 * Returns `loadMore` for IntersectionObserver-driven pagination
 * and refetches from the head when the follow set or the cert-
 * label exclude filter changes. On `INVALID_CURSOR` from a stale
 * cursor (e.g. a sort-mode swap), the hook drops the cursor and
 * reloads page 1.
 */
export function useHomeFeed(
  followedDids: Set<string>,
  options: UseHomeFeedOptions = {},
) {
  const [state, setState] = useState<State>(EMPTY_STATE)
  const { includeCertLabels, ready = true } = options
  // DEFAULT_HIDDEN_CERT_LABELS only kicks in when the caller has not
  // configured EITHER filter explicitly — i.e. "no filter at all"
  // reads as "use the sensible default (draft + likely-test hidden)".
  // As soon as the caller passes an include OR exclude list they're
  // in explicit control and the default stays out of the way. Without
  // this gate a viewer in include-only mode (Hyperlabel popover's
  // "Not labeled yet" unchecked) would have the default exclude
  // applied on top, dropping any tier listed in
  // DEFAULT_HIDDEN_CERT_LABELS even when they're explicitly ticked
  // in the include list.
  const excludeCertLabels: readonly string[] | undefined =
    options.excludeCertLabels !== undefined
      ? options.excludeCertLabels
      : includeCertLabels === undefined
        ? DEFAULT_HIDDEN_CERT_LABELS
        : undefined

  // Stable string key — parent useMemo of `followedDids` recomputes
  // a new Set instance whenever the union recomputes; we don't want
  // that to refire the fetch.
  const followedKey = useMemo(() => {
    if (followedDids.size === 0) return "[]"
    return Array.from(followedDids).sort().join(",")
  }, [followedDids])

  // Stable key for the label filters — drives the refetch effect
  // below so toggling either include OR exclude lists re-runs the
  // page-1 load. Keyed `exc=...|inc=...` so include vs exclude
  // changes don't collide (toggling unlabeled flips between the two).
  const excludeKey = useMemo(() => {
    const exc = excludeCertLabels ? [...excludeCertLabels].sort().join(",") : ""
    const inc = includeCertLabels ? [...includeCertLabels].sort().join(",") : ""
    return `exc=${exc}|inc=${inc}`
  }, [excludeCertLabels, includeCertLabels])

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
  const excludeCertLabelsRef = useRef<readonly string[] | undefined>(
    excludeCertLabels,
  )
  excludeCertLabelsRef.current = excludeCertLabels
  const includeCertLabelsRef = useRef<readonly string[] | undefined>(
    includeCertLabels,
  )
  includeCertLabelsRef.current = includeCertLabels

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
        includeCertLabels: includeCertLabelsRef.current,
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
          includeCertLabels: includeCertLabelsRef.current,
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
    // Wait for the caller's upstream resolutions (direct follows
    // AND any unioned author sources like trusted-evaluator
    // endorsements). Without this gate the effect fires once on
    // direct-follows-only, paints, then fires again when the
    // evaluator-endorsed-DID set lands — producing the two-phase
    // flash the user reported. Keep `isLoading: true` while we
    // wait so the body keeps showing the skeleton/spinner.
    if (!ready) {
      setState((prev) =>
        prev.isLoading ? prev : { ...prev, isLoading: true },
      )
      return
    }
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
    // followedKey covers follow-set changes; excludeKey covers filter
    // toggles — both should retrigger a from-the-head fetch. load is
    // stable (useCallback with []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedKey, excludeKey, ready])

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
    // Same collection payload backs both kinds — discriminator carries
    // through from the wire `event.kind` so the renderer can pick the
    // right sentence ("created a project" vs. "created a project with
    // a cert"). Unknown wire kinds fall through to the generic branch.
    if (h.event.kind === "project.created_with_cert") {
      return { ...base, kind: "project.created_with_cert", record: payload.record }
    }
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
      shortDescription: payload.shortDescription,
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
