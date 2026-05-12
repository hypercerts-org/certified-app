"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Minimal shape we care about from `app.bsky.feed.getAuthorFeed`. The
 * full response includes embeds, facets, counts, etc. — we only render
 * text + date + a deep link, so we keep the type small.
 */
export interface BskyPost {
  uri: string
  cid: string
  record: {
    text: string
    createdAt: string
  }
  author: {
    handle: string
  }
}

interface RawFeedItem {
  post?: {
    uri?: unknown
    cid?: unknown
    record?: { text?: unknown; createdAt?: unknown; $type?: unknown }
    author?: { handle?: unknown }
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

function normalize(raw: RawFeedResponse): { posts: BskyPost[]; cursor: string | null } {
  const posts: BskyPost[] = []
  for (const item of raw.feed ?? []) {
    if (!isPostRecord(item.post)) continue
    posts.push({
      uri: item.post.uri as string,
      cid: item.post.cid as string,
      record: {
        text: (item.post.record as { text: string }).text,
        createdAt: (item.post.record as { createdAt: string }).createdAt,
      },
      author: { handle: (item.post.author as { handle: string }).handle },
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

  // Guard against state updates after unmount (the hook is rendered
  // in the right rail which itself can unmount on viewport changes).
  const aliveRef = useRef(true)
  useEffect(() => () => { aliveRef.current = false }, [])

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
