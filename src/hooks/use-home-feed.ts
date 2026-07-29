"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  certifiedFeedImageUrl,
  CertifiedFeedError,
  fetchCertifiedFeed,
  type CertifiedFeedActor,
  type CertifiedFeedItem,
  type GetCertifiedFeedInput,
  type OrganizationQuality,
} from "@/lib/atproto/certified-feed"
import {
  fetchFollowerEvents,
  FollowerEventsError,
  hydrateFeedEvents,
  type FeedActor,
  type HydratedFeedEvent,
} from "@/lib/atproto/follower-events"
import { DEFAULT_HIDDEN_CERT_LABELS } from "@/lib/atproto/labels"
import { resolveActivityImageUrl } from "@/lib/atproto/activity"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"

const PAGE_SIZE = 50

export interface HomeFeedActor {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  /** Complete service summaries must never trigger a fallback identity read. */
  complete: boolean
}

export interface ActivityHomeFeedView {
  title: string
  shortDescription: string | null
  imageUrl: string | null
  startDate: string | null
  endDate: string | null
  locationCount: number
}

export interface CollectionHomeFeedView {
  collectionType: string | null
  title: string
  shortDescription: string | null
  imageUrl: string | null
  itemCount: number
}

export interface SimpleHomeFeedView {
  title: string | null
  shortDescription: string | null
  imageUrl: string | null
  targetUri: string | null
}

export interface HomeFeedEventBase {
  uri: string
  actor: string
  actorProfile: HomeFeedActor
  createdAt: string
}

export type HomeFeedEvent =
  | (HomeFeedEventBase & { kind: "cert.create"; view: ActivityHomeFeedView })
  | (HomeFeedEventBase & {
      kind: "collection.create" | "project.created_with_cert"
      view: CollectionHomeFeedView
    })
  | (HomeFeedEventBase & {
      kind: "endorsement.award" | "legacy.endorsement"
      subject: HomeFeedActor
      note: string | null
    })
  | (HomeFeedEventBase & {
      kind:
        | "evaluation.create"
        | "measurement.create"
        | "hyperboard.create"
        | "update.create"
      view: SimpleHomeFeedView
    })
  | (HomeFeedEventBase & {
      kind: "unknown"
      rawKind: string
      subjectUri: string
    })

interface State {
  events: HomeFeedEvent[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  cursor: string | null
  error: string | null
  continuationError: string | null
  retryAt: number | null
  canAutoLoad: boolean
}

const EMPTY_STATE: State = {
  events: [],
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  cursor: null,
  error: null,
  continuationError: null,
  retryAt: null,
  canAutoLoad: true,
}

interface ServiceState extends State {
  ownerKey: string
  retryFromHead: boolean
}

function emptyServiceState(ownerKey: string): ServiceState {
  return { ...EMPTY_STATE, ownerKey, retryFromHead: false }
}

export interface HomeFeedResult extends State {
  requestKey: string
  retryInitial: () => void
  loadMore: () => void
}

export interface UseHomeFeedOptions {
  trustedEvaluators: readonly string[]
  organizationQuality: {
    allowed: readonly OrganizationQuality[]
    includeUnrated: boolean
  }
  ready?: boolean
}

/** Hydrated Certified Feed Service hook. The service owns all graph expansion. */
export function useHomeFeed(
  viewerDid: string,
  options: UseHomeFeedOptions,
): HomeFeedResult {
  const { ready = true } = options
  const trustedKey = useMemo(
    () => [...new Set(options.trustedEvaluators)].sort().join(","),
    [options.trustedEvaluators],
  )
  const qualityKey = useMemo(
    () => [...new Set(options.organizationQuality.allowed)].sort().join(","),
    [options.organizationQuality.allowed],
  )
  const includeUnrated = options.organizationQuality.includeUnrated
  const requestKey = `${viewerDid}|${trustedKey}|${qualityKey}|${includeUnrated}`
  const input = useMemo<GetCertifiedFeedInput>(
    () => ({
      viewerDid,
      trustedEvaluators: trustedKey ? trustedKey.split(",") : [],
      organizationQuality: {
        allowed: qualityKey ? (qualityKey.split(",") as OrganizationQuality[]) : [],
        includeUnrated,
      },
      limit: PAGE_SIZE,
    }),
    [viewerDid, trustedKey, qualityKey, includeUnrated],
  )

  const [state, setState] = useState<ServiceState>(() =>
    emptyServiceState(requestKey),
  )
  const [retryNonce, setRetryNonce] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const currentRequestKeyRef = useRef(requestKey)
  currentRequestKeyRef.current = requestKey
  const generationRef = useRef(0)
  const headControllerRef = useRef<AbortController | null>(null)
  const continuationRef = useRef<{
    controller: AbortController
    ownerKey: string
  } | null>(null)
  const seenCursorsRef = useRef(new Set<string>())

  const loadHead = useCallback(
    async ({
      signal,
      generation,
      ownerKey,
      request,
      preserveEvents,
    }: {
      signal: AbortSignal
      generation: number
      ownerKey: string
      request: GetCertifiedFeedInput
      preserveEvents: boolean
    }) => {
      setState((previous) => {
        const base =
          preserveEvents && previous.ownerKey === ownerKey
            ? previous
            : emptyServiceState(ownerKey)
        return {
          ...base,
          ownerKey,
          isLoading: !preserveEvents,
          isLoadingMore: preserveEvents,
          error: null,
          continuationError: null,
          retryAt: null,
          canAutoLoad: true,
        }
      })
      try {
        const page = await fetchCertifiedFeed(request, { signal })
        if (
          signal.aborted ||
          generation !== generationRef.current ||
          ownerKey !== currentRequestKeyRef.current
        ) {
          return
        }
        seenCursorsRef.current = new Set(page.cursor ? [page.cursor] : [])
        setState({
          ...emptyServiceState(ownerKey),
          events: page.items.map(serviceItemToHomeFeedEvent),
          isLoading: false,
          hasMore: page.cursor !== null,
          cursor: page.cursor,
        })
      } catch (error) {
        if (
          signal.aborted ||
          generation !== generationRef.current ||
          ownerKey !== currentRequestKeyRef.current
        ) {
          return
        }
        const message = errorMessage(error)
        if (preserveEvents) {
          setState((previous) =>
            previous.ownerKey !== ownerKey
              ? previous
              : {
                  ...previous,
                  isLoading: false,
                  isLoadingMore: false,
                  cursor: null,
                  continuationError: message,
                  retryAt:
                    error instanceof CertifiedFeedError ? error.retryAt : null,
                  canAutoLoad: false,
                  retryFromHead: true,
                },
          )
        } else {
          setState({
            ...emptyServiceState(ownerKey),
            isLoading: false,
            error: message,
            retryAt:
              error instanceof CertifiedFeedError ? error.retryAt : null,
            canAutoLoad: false,
          })
        }
      }
    },
    [],
  )

  const retryInitial = useCallback(() => {
    const snapshot = stateRef.current
    if (
      snapshot.ownerKey !== currentRequestKeyRef.current ||
      (snapshot.retryAt !== null && Date.now() < snapshot.retryAt)
    ) {
      return
    }
    setRetryNonce((value) => value + 1)
  }, [])

  const loadMore = useCallback(() => {
    const snapshot = stateRef.current
    if (
      snapshot.ownerKey !== requestKey ||
      currentRequestKeyRef.current !== requestKey ||
      continuationRef.current !== null ||
      snapshot.isLoading ||
      snapshot.isLoadingMore ||
      (snapshot.retryAt !== null && Date.now() < snapshot.retryAt)
    ) {
      return
    }
    const retryFromHead = snapshot.retryFromHead
    if (!retryFromHead && (!snapshot.hasMore || !snapshot.cursor)) return

    const controller = new AbortController()
    continuationRef.current = { controller, ownerKey: requestKey }
    const generation = generationRef.current
    const requestedCursor = snapshot.cursor
    setState((previous) =>
      previous.ownerKey !== requestKey
        ? previous
        : {
            ...previous,
            isLoadingMore: true,
            continuationError: null,
            retryAt: null,
          },
    )

    const clearAdmission = () => {
      if (continuationRef.current?.controller === controller) {
        continuationRef.current = null
      }
    }

    if (retryFromHead) {
      void loadHead({
        signal: controller.signal,
        generation,
        ownerKey: requestKey,
        request: input,
        preserveEvents: true,
      }).finally(clearAdmission)
      return
    }

    void (async () => {
      try {
        const page = await fetchCertifiedFeed(
          { ...input, cursor: requestedCursor ?? undefined },
          { signal: controller.signal },
        )
        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          requestKey !== currentRequestKeyRef.current
        ) {
          return
        }
        if (page.cursor && seenCursorsRef.current.has(page.cursor)) {
          throw new CertifiedFeedError(
            "The feed service repeated an earlier cursor, so pagination stopped to prevent a request loop. Refresh the feed and try again.",
            502,
            "CursorCycle",
          )
        }
        if (page.cursor) seenCursorsRef.current.add(page.cursor)
        const fresh = page.items.map(serviceItemToHomeFeedEvent)
        setState((previous) => {
          if (previous.ownerKey !== requestKey) return previous
          const seen = new Set(previous.events.map((event) => event.uri))
          return {
            ...previous,
            events: [
              ...previous.events,
              ...fresh.filter((event) => !seen.has(event.uri)),
            ],
            isLoadingMore: false,
            hasMore: page.cursor !== null,
            cursor: page.cursor,
            continuationError: null,
            retryAt: null,
            canAutoLoad: true,
            retryFromHead: false,
          }
        })
      } catch (error) {
        if (
          controller.signal.aborted ||
          generation !== generationRef.current ||
          requestKey !== currentRequestKeyRef.current
        ) {
          return
        }
        if (
          error instanceof CertifiedFeedError &&
          error.code === "InvalidCursor"
        ) {
          // Relinquish the rejected cursor before page-one recovery. If
          // recovery fails, retryFromHead keeps the manual action on page one.
          seenCursorsRef.current.clear()
          setState((previous) =>
            previous.ownerKey !== requestKey
              ? previous
              : {
                  ...previous,
                  cursor: null,
                  hasMore: true,
                  retryFromHead: true,
                },
          )
          await loadHead({
            signal: controller.signal,
            generation,
            ownerKey: requestKey,
            request: input,
            preserveEvents: true,
          })
          return
        }
        setState((previous) =>
          previous.ownerKey !== requestKey
            ? previous
            : {
                ...previous,
                isLoadingMore: false,
                continuationError: errorMessage(error),
                retryAt:
                  error instanceof CertifiedFeedError ? error.retryAt : null,
                canAutoLoad: false,
                retryFromHead: false,
              },
        )
      } finally {
        clearAdmission()
      }
    })()
  }, [input, loadHead, requestKey])

  useEffect(() => {
    const generation = ++generationRef.current
    headControllerRef.current?.abort()
    continuationRef.current?.controller.abort()
    continuationRef.current = null
    seenCursorsRef.current.clear()

    if (!ready) {
      setState(emptyServiceState(requestKey))
      return
    }

    const controller = new AbortController()
    headControllerRef.current = controller
    void loadHead({
      signal: controller.signal,
      generation,
      ownerKey: requestKey,
      request: input,
      preserveEvents: false,
    })
    return () => {
      controller.abort()
      if (headControllerRef.current === controller) {
        headControllerRef.current = null
      }
      continuationRef.current?.controller.abort()
      continuationRef.current = null
    }
  }, [requestKey, ready, retryNonce, input, loadHead])

  const visibleState =
    state.ownerKey === requestKey ? state : emptyServiceState(requestKey)
  const { ownerKey: _ownerKey, retryFromHead: _retryFromHead, ...result } =
    visibleState
  return { ...result, requestKey, retryInitial, loadMore }
}

/** Rollback hook retaining the previous browser/indexer pipeline. */
export function useLegacyHomeFeed(
  followedDids: Set<string>,
  options: { ready?: boolean } = {},
): HomeFeedResult {
  const { ready = true } = options
  const followedKey = useMemo(
    () => (followedDids.size ? [...followedDids].sort().join(",") : "[]"),
    [followedDids],
  )
  const [state, setState] = useState<State>(EMPTY_STATE)
  const [retryNonce, setRetryNonce] = useState(0)
  const followedRef = useRef(followedDids)
  followedRef.current = followedDids
  const stateRef = useRef(state)
  stateRef.current = state
  const generationRef = useRef(0)
  const continuationControllerRef = useRef<AbortController | null>(null)

  const loadHead = useCallback(async (signal: AbortSignal, generation: number) => {
    setState(EMPTY_STATE)
    const authors = [...followedRef.current]
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
      const hydrated = await hydrateFeedEvents(page.events, {
        signal,
        excludeCertLabels: DEFAULT_HIDDEN_CERT_LABELS,
      })
      if (signal.aborted || generation !== generationRef.current) return
      setState({
        events: hydrated.map(legacyItemToHomeFeedEvent).filter(passesLegacyFilter),
        isLoading: false,
        isLoadingMore: false,
        hasMore: page.hasNextPage,
        cursor: page.endCursor,
        error: null,
        continuationError: null,
        retryAt: null,
        canAutoLoad: true,
      })
    } catch (error) {
      if (signal.aborted || generation !== generationRef.current) return
      setState({ ...EMPTY_STATE, isLoading: false, error: errorMessage(error) })
    }
  }, [])

  const retryInitial = useCallback(() => setRetryNonce((value) => value + 1), [])
  const loadMore = useCallback(() => {
    const snapshot = stateRef.current
    if (snapshot.isLoading || snapshot.isLoadingMore || !snapshot.hasMore || !snapshot.cursor) return
    const authors = [...followedRef.current]
    if (!authors.length) return
    continuationControllerRef.current?.abort()
    const controller = new AbortController()
    continuationControllerRef.current = controller
    const generation = generationRef.current
    setState((previous) => ({ ...previous, isLoadingMore: true, continuationError: null }))
    void (async () => {
      try {
        const page = await fetchFollowerEvents({
          authors,
          first: PAGE_SIZE,
          after: snapshot.cursor ?? undefined,
          sortBy: "CREATED_AT",
          signal: controller.signal,
        })
        const hydrated = await hydrateFeedEvents(page.events, {
          signal: controller.signal,
          excludeCertLabels: DEFAULT_HIDDEN_CERT_LABELS,
        })
        if (controller.signal.aborted || generation !== generationRef.current) return
        const fresh = hydrated.map(legacyItemToHomeFeedEvent).filter(passesLegacyFilter)
        setState((previous) => {
          const seen = new Set(previous.events.map((event) => event.uri))
          return {
            ...previous,
            events: [...previous.events, ...fresh.filter((event) => !seen.has(event.uri))],
            isLoadingMore: false,
            hasMore: page.hasNextPage,
            cursor: page.endCursor,
            continuationError: null,
            canAutoLoad: true,
          }
        })
      } catch (error) {
        if (controller.signal.aborted || generation !== generationRef.current) return
        if (error instanceof FollowerEventsError && error.code === "INVALID_CURSOR") {
          void loadHead(controller.signal, generation)
          return
        }
        setState((previous) => ({
          ...previous,
          isLoadingMore: false,
          continuationError: errorMessage(error),
          canAutoLoad: false,
        }))
      }
    })()
  }, [loadHead])

  useEffect(() => {
    const generation = ++generationRef.current
    continuationControllerRef.current?.abort()
    if (!ready) {
      setState((previous) => ({ ...previous, isLoading: true }))
      return
    }
    const controller = new AbortController()
    void loadHead(controller.signal, generation)
    return () => {
      controller.abort()
      continuationControllerRef.current?.abort()
    }
  }, [followedKey, ready, retryNonce, loadHead])

  return { ...state, requestKey: followedKey, retryInitial, loadMore }
}

function serviceActor(actor: CertifiedFeedActor): HomeFeedActor {
  return {
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    avatarUrl: certifiedFeedImageUrl(actor.avatar, actor.did),
    complete: true,
  }
}

function serviceItemToHomeFeedEvent(item: CertifiedFeedItem): HomeFeedEvent {
  const actorProfile = serviceActor(item.actor)
  const sourceDid = parseSourceDid(item.subject.uri) ?? item.actor.did
  const createdAt = "createdAt" in item.view && item.view.createdAt
    ? item.view.createdAt
    : item.feedTimestamp
  const base: HomeFeedEventBase = {
    uri: item.id,
    actor: item.actor.did,
    actorProfile,
    createdAt,
  }
  if ("unknown" in item.view) {
    return {
      ...base,
      kind: "unknown",
      rawKind: item.kind,
      subjectUri: item.subject.uri,
    }
  }
  switch (item.view.$type) {
    case "app.certified.feed.beta.defs#activityView":
      return {
        ...base,
        kind: "cert.create",
        view: {
          title: item.view.title,
          shortDescription: item.view.shortDescription,
          imageUrl: certifiedFeedImageUrl(item.view.image, sourceDid),
          startDate: item.view.startDate,
          endDate: item.view.endDate,
          locationCount: item.view.locationCount,
        },
      }
    case "app.certified.feed.beta.defs#collectionView":
      return {
        ...base,
        kind: item.kind === "project.created_with_cert" ? item.kind : "collection.create",
        view: {
          collectionType: item.view.collectionType,
          title: item.view.title,
          shortDescription: item.view.shortDescription,
          imageUrl: certifiedFeedImageUrl(item.view.image, sourceDid),
          itemCount: item.view.itemCount,
        },
      }
    case "app.certified.feed.beta.defs#endorsementView":
      return {
        ...base,
        kind: "endorsement.award",
        subject: serviceActor(item.view.subject),
        note: null,
      }
    case "app.certified.feed.beta.defs#evaluationView":
      return {
        ...base,
        kind: "evaluation.create",
        view: simpleView(item.view.summary, null, null, item.view.target?.uri ?? null),
      }
    case "app.certified.feed.beta.defs#measurementView":
      return {
        ...base,
        kind: "measurement.create",
        view: simpleView(item.view.metric, null, null, item.view.target?.uri ?? null),
      }
    case "app.certified.feed.beta.defs#hyperboardView":
      return { ...base, kind: "hyperboard.create", view: simpleView(null, null, null, null) }
    case "app.certified.feed.beta.defs#updateView":
      return {
        ...base,
        kind: "update.create",
        view: simpleView(
          item.view.title,
          item.view.shortDescription,
          certifiedFeedImageUrl(item.view.image, sourceDid),
          item.view.target?.uri ?? null,
        ),
      }
    default:
      return { ...base, kind: "unknown", rawKind: item.kind, subjectUri: item.subject.uri }
  }
}

function legacyActor(actor: FeedActor): HomeFeedActor {
  return {
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    avatarUrl: buildAvatarUrlFromCid(actor.did, actor.avatarCid),
    complete: false,
  }
}

function incompleteActor(did: string): HomeFeedActor {
  return { did, handle: null, displayName: null, avatarUrl: null, complete: false }
}

function legacyItemToHomeFeedEvent(item: HydratedFeedEvent): HomeFeedEvent {
  const payload = item.payload
  const sourceDid = parseSourceDid(item.event.subjectUri) ?? item.event.actor.did
  const createdAt = legacyRecordCreatedAt(item) ?? item.event.sortAt
  const base: HomeFeedEventBase = {
    uri: item.event.id,
    actor: item.event.actor.did,
    actorProfile: legacyActor(item.event.actor),
    createdAt,
  }
  if (payload?.kind === "cert.create") {
    const value = payload.record.value
    return {
      ...base,
      kind: "cert.create",
      view: {
        title: value.title || "Untitled activity",
        shortDescription: value.shortDescription || null,
        imageUrl: resolveActivityImageUrl(value.image, sourceDid),
        startDate: value.startDate ?? null,
        endDate: value.endDate ?? null,
        locationCount: value.locations?.length ?? 0,
      },
    }
  }
  if (payload?.kind === "collection.create") {
    const value = payload.record.value
    const rawImage = value.avatar ?? value.image ?? value.banner
    return {
      ...base,
      kind: item.event.kind === "project.created_with_cert" ? "project.created_with_cert" : "collection.create",
      view: {
        collectionType: typeof value.type === "string" ? value.type : null,
        title:
          (typeof value.title === "string" && value.title) ||
          (typeof value.name === "string" && value.name) ||
          "Untitled project",
        shortDescription:
          typeof value.shortDescription === "string" && value.shortDescription
            ? value.shortDescription
            : null,
        imageUrl: rawImage
          ? resolveActivityImageUrl(
              rawImage as Parameters<typeof resolveActivityImageUrl>[0],
              sourceDid,
            )
          : null,
        itemCount: Array.isArray(value.items) ? value.items.length : 0,
      },
    }
  }
  if (payload?.kind === "endorsement.award") {
    return {
      ...base,
      kind: "endorsement.award",
      subject: incompleteActor(payload.subjectDid),
      note: payload.note,
    }
  }
  if (payload?.kind === "legacy.endorsement") {
    return {
      ...base,
      kind: "legacy.endorsement",
      subject: incompleteActor(payload.subjectDid),
      note: null,
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
      view: simpleView(
        payload.title,
        payload.shortDescription,
        payload.imageUrl,
        payload.targetUri,
      ),
    }
  }
  return {
    ...base,
    kind: "unknown",
    rawKind: item.event.kind,
    subjectUri: item.event.subjectUri,
  }
}

function simpleView(
  title: string | null,
  shortDescription: string | null,
  imageUrl: string | null,
  targetUri: string | null,
): SimpleHomeFeedView {
  return { title, shortDescription, imageUrl, targetUri }
}

function passesLegacyFilter(event: HomeFeedEvent): boolean {
  return event.kind !== "unknown" || event.rawKind !== "cert.create"
}

function legacyRecordCreatedAt(item: HydratedFeedEvent): string | null {
  const payload = item.payload
  if (!payload) return null
  if (payload.kind === "cert.create" || payload.kind === "collection.create") {
    const createdAt = payload.record.value.createdAt
    return typeof createdAt === "string" && createdAt ? createdAt : null
  }
  return payload.createdAt
}

function parseSourceDid(uri: string): string | null {
  if (!uri.startsWith("at://")) return null
  return uri.slice(5).split("/")[0] || null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The feed could not be loaded. Try again."
}
