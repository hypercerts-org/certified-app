"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  COMMENTS_BATCH_SUBJECTS,
  fetchCommentsForSubject,
  fetchCommentsForSubjects,
  newestFirst,
  type FeedComment,
} from "@/lib/atproto/comments"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

/**
 * The comment threads of the activities and projects on screen, shared
 * across every card. Cards that mount together (a page of the feed) are
 * read in one batched request rather than one each; a thread with more
 * comments than the batch holds pages in on its own when it is opened.
 *
 * Comments the viewer posts or deletes show at once: the indexer takes a
 * moment to see them, so a read that comes back without a new comment (or
 * still with a deleted one) is corrected here until it catches up.
 */

export interface CommentsView {
  /** Newest first: every comment loaded so far. */
  comments: FeedComment[]
  /** How many comments the subject has, as best known. */
  total: number
  status: "loading" | "ready" | "error"
  /** True once every comment is loaded. */
  complete: boolean
  loadingMore: boolean
}

interface Entry {
  view: CommentsView
  /** Cursor for the next older page of this subject's own thread; null
   *  when the list came from a batch and paging hasn't started. */
  next: string | null
  fetchedAt: number
}

const LOADING_VIEW: CommentsView = Object.freeze({
  comments: [],
  total: 0,
  status: "loading",
  complete: false,
  loadingMore: false,
}) as CommentsView

/** A thread read this recently isn't read again when a card remounts. */
const REVALIDATE_MS = 60_000
/** Cards that mount within this window share one batch. */
const BATCH_DELAY_MS = 30
/** Comments read per page when a thread pages on its own. */
const PAGE_SIZE = 50

const cache = createBoundedCache<string, Entry>(500)
const queued = new Set<string>()
const inFlight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

/** Posted this session, by subject: kept until a read includes them. */
const added = new Map<string, FeedComment[]>()
/** Deleted this session: kept out of every read. */
const removed = new Set<string>()

const listeners = new Set<() => void>()
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function emit(): void {
  for (const l of listeners) l()
}

function setView(uri: string, view: CommentsView, extra: Partial<Omit<Entry, "view">> = {}): void {
  const prev = cache.get(uri)
  cache.set(uri, {
    view,
    next: extra.next !== undefined ? extra.next : (prev?.next ?? null),
    fetchedAt: extra.fetchedAt ?? prev?.fetchedAt ?? 0,
  })
  emit()
}

/**
 * Fold a read into what the viewer has done since: drop deleted
 * comments, keep posted ones the read doesn't have yet. `total` is the
 * count the read reported (null when it read everything).
 */
function reconcile(
  uri: string,
  fetched: readonly FeedComment[],
  total: number | null,
): { comments: FeedComment[]; total: number } {
  const seen = new Set(fetched.map((c) => c.uri))
  const pending = (added.get(uri) ?? []).filter((c) => !seen.has(c.uri) && !removed.has(c.uri))
  // Posted comments the indexer now has no longer need holding.
  if (added.has(uri)) {
    const still = (added.get(uri) ?? []).filter((c) => !seen.has(c.uri))
    if (still.length > 0) added.set(uri, still)
    else added.delete(uri)
  }
  const stale = fetched.filter((c) => removed.has(c.uri)).length
  const comments = [...pending, ...fetched.filter((c) => !removed.has(c.uri))].sort(newestFirst)
  const counted = (total ?? fetched.length) + pending.length - stale
  return { comments, total: Math.max(comments.length, counted) }
}

function flush(): void {
  timer = null
  const uris = [...queued]
  queued.clear()
  for (let i = 0; i < uris.length; i += COMMENTS_BATCH_SUBJECTS) {
    void readBatch(uris.slice(i, i + COMMENTS_BATCH_SUBJECTS))
  }
}

async function readBatch(uris: string[]): Promise<void> {
  for (const uri of uris) inFlight.add(uri)
  try {
    const batch = await fetchCommentsForSubjects(uris)
    const now = Date.now()
    for (const uri of uris) {
      const fetched = batch.bySubject.get(uri) ?? []
      if (batch.complete) {
        const { comments, total } = reconcile(uri, fetched, null)
        setView(
          uri,
          { comments, total, status: "ready", complete: true, loadingMore: false },
          { next: null, fetchedAt: now },
        )
      }
    }
    // A batch with more comments than one page holds may have cut some
    // threads short; read each of those on its own for its full count.
    if (!batch.complete) {
      await Promise.all(uris.map((uri) => readFirstPage(uri)))
    }
  } catch {
    for (const uri of uris) {
      const prev = cache.get(uri)?.view
      setView(uri, {
        ...(prev ?? LOADING_VIEW),
        status: prev && prev.status === "ready" ? "ready" : "error",
        loadingMore: false,
      })
    }
  } finally {
    for (const uri of uris) inFlight.delete(uri)
  }
}

async function readFirstPage(uri: string): Promise<void> {
  try {
    const page = await fetchCommentsForSubject(uri, { first: PAGE_SIZE })
    const { comments, total } = reconcile(uri, page.comments, page.next ? page.totalCount : null)
    setView(
      uri,
      { comments, total, status: "ready", complete: !page.next, loadingMore: false },
      { next: page.next, fetchedAt: Date.now() },
    )
  } catch {
    const prev = cache.get(uri)?.view
    setView(uri, { ...(prev ?? LOADING_VIEW), status: prev?.status === "ready" ? "ready" : "error" })
  }
}

/** Ask for a subject's thread; batched with the other cards mounting now. */
function request(uri: string, force = false): void {
  const entry = cache.get(uri)
  if (!force && entry && entry.view.status !== "error" && Date.now() - entry.fetchedAt < REVALIDATE_MS) return
  if (inFlight.has(uri) || queued.has(uri)) return
  if (entry?.view.status === "error") setView(uri, { ...entry.view, status: "loading" })
  queued.add(uri)
  timer ??= setTimeout(flush, BATCH_DELAY_MS)
}

/** Read the next older page of a subject's thread. */
async function loadMore(uri: string): Promise<void> {
  const entry = cache.get(uri)
  if (!entry || entry.view.complete || entry.view.loadingMore) return
  setView(uri, { ...entry.view, loadingMore: true })
  try {
    // A list that came from a batch has no cursor: start the thread from
    // the top; what was already loaded merges in.
    const page = await fetchCommentsForSubject(uri, { first: PAGE_SIZE, after: entry.next })
    const current = cache.get(uri)?.view ?? entry.view
    const byUri = new Map(current.comments.map((c) => [c.uri, c]))
    for (const c of page.comments) if (!removed.has(c.uri)) byUri.set(c.uri, c)
    const comments = [...byUri.values()].sort(newestFirst)
    const complete = !page.next
    setView(
      uri,
      {
        comments,
        total: complete ? comments.length : Math.max(current.total, comments.length),
        status: "ready",
        complete,
        loadingMore: false,
      },
      { next: page.next },
    )
  } catch {
    const current = cache.get(uri)?.view ?? entry.view
    setView(uri, { ...current, loadingMore: false })
    throw new Error("Couldn't load more comments")
  }
}

/** Show a comment the viewer just posted. */
function addComment(uri: string, comment: FeedComment): void {
  added.set(uri, [comment, ...(added.get(uri) ?? [])])
  const view = cache.get(uri)?.view ?? { ...LOADING_VIEW, status: "ready" as const, complete: true }
  setView(uri, {
    ...view,
    comments: [comment, ...view.comments.filter((c) => c.uri !== comment.uri)],
    total: view.total + 1,
  })
}

/** Take out a comment the viewer just deleted. */
function removeComment(uri: string, commentUri: string): void {
  removed.add(commentUri)
  const view = cache.get(uri)?.view
  if (!view) return
  const comments = view.comments.filter((c) => c.uri !== commentUri)
  setView(uri, {
    ...view,
    comments,
    total: Math.max(comments.length, view.total - (comments.length < view.comments.length ? 1 : 0)),
  })
}

export interface UseComments extends CommentsView {
  loadMore: () => Promise<void>
  retry: () => void
  add: (comment: FeedComment) => void
  remove: (commentUri: string) => void
}

/** The comment thread of one activity or project. */
export function useComments(subjectUri: string): UseComments {
  const view = useSyncExternalStore(
    subscribe,
    () => cache.get(subjectUri)?.view ?? LOADING_VIEW,
    () => LOADING_VIEW,
  )

  useEffect(() => {
    request(subjectUri)
  }, [subjectUri])

  return {
    ...view,
    loadMore: useCallback(() => loadMore(subjectUri), [subjectUri]),
    retry: useCallback(() => request(subjectUri, true), [subjectUri]),
    add: useCallback((c: FeedComment) => addComment(subjectUri, c), [subjectUri]),
    remove: useCallback((u: string) => removeComment(subjectUri, u), [subjectUri]),
  }
}

/** Test helper: forget every thread and pending change. */
export function __resetCommentsStore(): void {
  cache.clear()
  queued.clear()
  inFlight.clear()
  added.clear()
  removed.clear()
  if (timer) clearTimeout(timer)
  timer = null
}
