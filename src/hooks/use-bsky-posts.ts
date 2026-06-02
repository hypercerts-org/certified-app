"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * `app.bsky.richtext.facet` — byte ranges within `post.record.text`
 * that carry features (links, mentions, tags). The byte indices are
 * UTF-8 byte offsets, NOT JS character indices — see the RichText
 * renderer for the slicing logic.
 */
export type BskyFacetFeature =
  | { $type: "app.bsky.richtext.facet#link"; uri: string }
  | { $type: "app.bsky.richtext.facet#mention"; did: string }
  | { $type: "app.bsky.richtext.facet#tag"; tag: string }

export interface BskyFacet {
  index: { byteStart: number; byteEnd: number }
  features: BskyFacetFeature[]
}

/**
 * One image from a post's `app.bsky.embed.images#view` embed.
 * `thumb` is the feed-sized CDN URL; `fullsize` is the click-through
 * target. Bluesky's appView populates both — we use thumb in the rail
 * and link to the original bsky.app post for the full view.
 */
export interface BskyImage {
  thumb: string
  fullsize: string
  alt: string
  aspectRatio?: { width: number; height: number }
}

/**
 * Minimal shape we care about from `app.bsky.feed.getAuthorFeed`. The
 * full response includes embeds, counts, etc. — we only render text +
 * facets + date + image embed + a deep link, so we keep the type small.
 */
export interface BskyPost {
  uri: string
  cid: string
  record: {
    text: string
    createdAt: string
    facets?: BskyFacet[]
  }
  author: {
    handle: string
  }
  /** Image embed view, if the post has one (also covers the
   *  recordWithMedia variant whose media is images). */
  images?: BskyImage[]
}

interface RawFeedItem {
  post?: {
    uri?: unknown
    cid?: unknown
    record?: {
      text?: unknown
      createdAt?: unknown
      $type?: unknown
      facets?: unknown
    }
    author?: { handle?: unknown }
    embed?: unknown
  }
}

interface RawFeedResponse {
  feed?: RawFeedItem[]
  cursor?: unknown
}

const BSKY_APPVIEW = "https://public.api.bsky.app"
const INITIAL_LIMIT = 1
const MORE_LIMIT = 3

function isPostRecord(record: RawFeedItem["post"]): record is BskyPost & RawFeedItem["post"] {
  if (!record) return false
  const r = record.record
  return (
    typeof record.uri === "string" &&
    typeof record.cid === "string" &&
    typeof record?.author?.handle === "string" &&
    typeof r?.text === "string" &&
    typeof r?.createdAt === "string"
  )
}

function isFacetFeature(value: unknown): value is BskyFacetFeature {
  if (!value || typeof value !== "object") return false
  const f = value as Record<string, unknown>
  if (f.$type === "app.bsky.richtext.facet#link") return typeof f.uri === "string"
  if (f.$type === "app.bsky.richtext.facet#mention") return typeof f.did === "string"
  if (f.$type === "app.bsky.richtext.facet#tag") return typeof f.tag === "string"
  return false
}

function normalizeFacets(raw: unknown): BskyFacet[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: BskyFacet[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const f = item as Record<string, unknown>
    const idx = f.index as { byteStart?: unknown; byteEnd?: unknown } | undefined
    if (!idx) continue
    const byteStart = typeof idx.byteStart === "number" ? idx.byteStart : NaN
    const byteEnd = typeof idx.byteEnd === "number" ? idx.byteEnd : NaN
    if (!Number.isFinite(byteStart) || !Number.isFinite(byteEnd)) continue
    if (byteStart < 0 || byteEnd <= byteStart) continue
    const featuresRaw = Array.isArray(f.features) ? f.features : []
    const features = featuresRaw.filter(isFacetFeature)
    if (features.length === 0) continue
    out.push({ index: { byteStart, byteEnd }, features })
  }
  return out.length > 0 ? out : undefined
}

/**
 * Pull the images array out of a post `embed` view. Handles both the
 * direct `app.bsky.embed.images#view` shape and the wrapped
 * `app.bsky.embed.recordWithMedia#view` shape (media is images).
 * Everything else (external link cards, videos, quoted records
 * without media) returns undefined.
 */
function normalizeImages(rawEmbed: unknown): BskyImage[] | undefined {
  if (!rawEmbed || typeof rawEmbed !== "object") return undefined
  const e = rawEmbed as Record<string, unknown>
  const target =
    e.$type === "app.bsky.embed.images#view"
      ? e
      : e.$type === "app.bsky.embed.recordWithMedia#view" &&
          (e.media as Record<string, unknown> | undefined)?.$type ===
            "app.bsky.embed.images#view"
        ? (e.media as Record<string, unknown>)
        : null
  if (!target) return undefined
  const rawImages = target.images
  if (!Array.isArray(rawImages)) return undefined
  const out: BskyImage[] = []
  for (const img of rawImages) {
    if (!img || typeof img !== "object") continue
    const i = img as Record<string, unknown>
    if (typeof i.thumb !== "string" || typeof i.fullsize !== "string") continue
    const alt = typeof i.alt === "string" ? i.alt : ""
    const ratio = i.aspectRatio as { width?: unknown; height?: unknown } | undefined
    const aspectRatio =
      ratio && typeof ratio.width === "number" && typeof ratio.height === "number"
        ? { width: ratio.width, height: ratio.height }
        : undefined
    out.push({ thumb: i.thumb, fullsize: i.fullsize, alt, aspectRatio })
  }
  return out.length > 0 ? out : undefined
}

function normalize(raw: RawFeedResponse): { posts: BskyPost[]; cursor: string | null } {
  const posts: BskyPost[] = []
  for (const item of raw.feed ?? []) {
    if (!isPostRecord(item.post)) continue
    const record = item.post.record as { text: string; createdAt: string; facets?: unknown }
    posts.push({
      uri: item.post.uri as string,
      cid: item.post.cid as string,
      record: {
        text: record.text,
        createdAt: record.createdAt,
        facets: normalizeFacets(record.facets),
      },
      author: { handle: (item.post.author as { handle: string }).handle },
      images: normalizeImages(item.post.embed),
    })
  }
  const cursor = typeof raw.cursor === "string" && raw.cursor.length > 0 ? raw.cursor : null
  return { posts, cursor }
}

/**
 * Fetches public posts (no replies) for a Bluesky handle via the
 * unauthenticated appView. Starts with one post and exposes a
 * `loadMore` that pulls the next page of three older posts. When the
 * upstream stops returning a cursor — or returns fewer posts than we
 * asked for — `hasMore` flips false so the caller can hide its
 * pagination control.
 */
export function useBskyPosts(handle: string) {
  const [posts, setPosts] = useState<BskyPost[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard against state updates after unmount. Importantly, the setup
  // re-asserts `current = true` — React Strict Mode (dev) runs the
  // cleanup once between the two mounted passes, and without re-
  // assertion the ref would stay `false` forever and every state
  // setter inside the fetch promise would no-op, leaving the consumer
  // stuck on the initial loading state.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  // Singleflight token for the in-flight request. If a second fetch
  // kicks off (e.g. handle changes) we ignore the older one's result.
  const requestIdRef = useRef(0)

  const fetchPage = useCallback(
    async (opts: { cursor: string | null; limit: number }): Promise<{
      posts: BskyPost[]
      cursor: string | null
    } | null> => {
      const id = ++requestIdRef.current
      const params = new URLSearchParams({
        actor: handle,
        limit: String(opts.limit),
        filter: "posts_no_replies",
      })
      if (opts.cursor) params.set("cursor", opts.cursor)

      const res = await fetch(
        `${BSKY_APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?${params.toString()}`,
        { signal: AbortSignal.timeout(8_000) },
      )
      if (!res.ok) throw new Error(`Upstream returned ${res.status}`)
      const json = (await res.json()) as RawFeedResponse
      // If a newer request started while we were awaiting, drop ours.
      if (id !== requestIdRef.current) return null
      return normalize(json)
    },
    [handle],
  )

  useEffect(() => {
    if (!handle) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setPosts([])
    setCursor(null)
    setHasMore(true)
    fetchPage({ cursor: null, limit: INITIAL_LIMIT })
      .then((result) => {
        if (cancelled || !result || !aliveRef.current) return
        setPosts(result.posts)
        setCursor(result.cursor)
        // No cursor returned, OR upstream gave us less than we asked
        // for → the timeline is exhausted.
        if (!result.cursor || result.posts.length < INITIAL_LIMIT) {
          setHasMore(false)
        }
      })
      .catch((err: unknown) => {
        if (cancelled || !aliveRef.current) return
        setError(err instanceof Error ? err.message : "Failed to load posts")
        setHasMore(false)
      })
      .finally(() => {
        if (!cancelled && aliveRef.current) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [handle, fetchPage])

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const result = await fetchPage({ cursor, limit: MORE_LIMIT })
      if (!result || !aliveRef.current) return
      setPosts((prev) => [...prev, ...result.posts])
      setCursor(result.cursor)
      if (!result.cursor || result.posts.length < MORE_LIMIT) {
        setHasMore(false)
      }
    } catch (err: unknown) {
      if (!aliveRef.current) return
      setError(err instanceof Error ? err.message : "Failed to load more posts")
      setHasMore(false)
    } finally {
      if (aliveRef.current) setIsLoadingMore(false)
    }
  }, [cursor, hasMore, isLoadingMore, fetchPage])

  return { posts, hasMore, isLoading, isLoadingMore, error, loadMore }
}
