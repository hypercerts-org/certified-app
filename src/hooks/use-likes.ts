"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  fetchLikesForSubjects,
  fetchOwnLikes,
  likeRecord,
  unlikeRecord,
  type LikeTally,
} from "@/lib/atproto/likes"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

/**
 * Likes for the activities, projects and updates on screen, shared by
 * every card and button. Counts are batched like comment threads (one
 * indexer request for the cards that mount together); what an account
 * liked is read once from its own repository and shared. A like or an
 * unlike shows at once and is reconciled with later reads.
 */

const BATCH_DELAY_MS = 30
const BATCH_SUBJECTS = 50
const REVALIDATE_MS = 60_000
/** After the indexer says it can't count likes, wait this long before
 *  asking again. */
const UNAVAILABLE_RETRY_MS = 5 * 60_000

interface CountEntry {
  /** Null while unread, or when the indexer can't count likes. */
  tally: LikeTally | null
  fetchedAt: number
}

const counts = createBoundedCache<string, CountEntry>(1000)
const queued = new Set<string>()
const inFlight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let unavailableUntil = 0

interface OwnEntry {
  likes: Map<string, string>
  status: "loading" | "ready" | "error"
  fetchedAt: number
}
const own = new Map<string, OwnEntry>()
const ownInFlight = new Set<string>()

/** What the viewer did this session, by `${actor} ${subject}`: the
 *  like's URI, or null for a like taken back. Wins over reads until a
 *  read agrees. */
const overrides = new Map<string, string | null>()
/** Change to a count read without its likers, since that read. */
const deltas = new Map<string, number>()
/** Likes being written or deleted. */
const pending = new Set<string>()

let version = 0
const listeners = new Set<() => void>()
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
function emit(): void {
  version++
  for (const l of listeners) l()
}

const key = (actor: string, subject: string) => `${actor} ${subject}`

function requestCount(subject: string): void {
  const entry = counts.get(subject)
  if (entry && Date.now() - entry.fetchedAt < REVALIDATE_MS) return
  if (Date.now() < unavailableUntil) return
  if (queued.has(subject) || inFlight.has(subject)) return
  queued.add(subject)
  timer ??= setTimeout(flush, BATCH_DELAY_MS)
}

function flush(): void {
  timer = null
  const subjects = [...queued]
  queued.clear()
  for (let i = 0; i < subjects.length; i += BATCH_SUBJECTS) {
    void readCounts(subjects.slice(i, i + BATCH_SUBJECTS))
  }
}

async function readCounts(subjects: string[]): Promise<void> {
  for (const s of subjects) inFlight.add(s)
  try {
    const batch = await fetchLikesForSubjects(subjects)
    const now = Date.now()
    if (!batch.available) unavailableUntil = now + UNAVAILABLE_RETRY_MS
    for (const s of subjects) {
      counts.set(s, { tally: batch.available ? (batch.bySubject.get(s) ?? null) : null, fetchedAt: now })
      deltas.delete(s)
    }
    emit()
  } catch {
    // Counts are extra: a failed read leaves the button without one.
  } finally {
    for (const s of subjects) inFlight.delete(s)
  }
}

function requestOwn(actor: string): void {
  const entry = own.get(actor)
  if (entry && entry.status !== "error" && Date.now() - entry.fetchedAt < REVALIDATE_MS) return
  if (ownInFlight.has(actor)) return
  ownInFlight.add(actor)
  if (!entry) {
    own.set(actor, { likes: new Map(), status: "loading", fetchedAt: 0 })
    emit()
  }
  fetchOwnLikes(actor)
    .then((likes) => {
      own.set(actor, { likes, status: "ready", fetchedAt: Date.now() })
      // A read that agrees with what the viewer did ends the override.
      for (const [k, v] of overrides) {
        const [a, subject] = k.split(" ")
        if (a !== actor) continue
        const read = likes.get(subject) ?? null
        if ((v === null && read === null) || (v !== null && read === v)) overrides.delete(k)
      }
    })
    .catch(() => {
      const prev = own.get(actor)
      own.set(actor, { likes: prev?.likes ?? new Map(), status: "error", fetchedAt: Date.now() })
    })
    .finally(() => {
      ownInFlight.delete(actor)
      emit()
    })
}

function likeUriOf(actor: string, subject: string): string | null {
  const k = key(actor, subject)
  if (overrides.has(k)) return overrides.get(k) ?? null
  return own.get(actor)?.likes.get(subject) ?? null
}

function shownCount(subject: string, actor: string | null): number | null {
  const tally = counts.get(subject)?.tally
  if (!tally) return null
  if (tally.likers && actor) {
    const set = new Set(tally.likers)
    if (likeUriOf(actor, subject)) set.add(actor)
    else set.delete(actor)
    return set.size
  }
  return Math.max(0, tally.count + (deltas.get(subject) ?? 0))
}

async function toggle(ownDid: string, actor: string, subject: { uri: string; cid: string }): Promise<void> {
  const k = key(actor, subject.uri)
  if (pending.has(k)) return
  const current = likeUriOf(actor, subject.uri)
  pending.add(k)
  const counted = counts.get(subject.uri)?.tally
  const step = (n: number) => {
    if (counted && !counted.likers) deltas.set(subject.uri, (deltas.get(subject.uri) ?? 0) + n)
  }
  try {
    if (current) {
      // Show it gone at once; put it back if the delete fails.
      overrides.set(k, null)
      step(-1)
      emit()
      try {
        await unlikeRecord(ownDid, actor, current)
      } catch (err) {
        overrides.set(k, current)
        step(1)
        throw err
      }
    } else {
      overrides.set(k, "pending")
      step(1)
      emit()
      try {
        const ref = await likeRecord(ownDid, actor, subject)
        overrides.set(k, ref.uri)
      } catch (err) {
        overrides.set(k, null)
        step(-1)
        throw err
      }
    }
  } finally {
    pending.delete(k)
    emit()
  }
}

export interface UseLike {
  /** Accounts that like it; null when the count isn't known (the
   *  indexer can't count likes yet, or it's still loading). */
  count: number | null
  /** Whether `actor` likes it. */
  liked: boolean
  /** A like or unlike is being written. */
  busy: boolean
  toggle: () => Promise<void>
}

/**
 * The like state of one subject for `actor` (the account likes are made
 * as: you, or a group you act for). `ownDid` is your session DID, for the
 * write. Signed out (`actor` null) it only reads the count.
 */
export function useLike(
  subject: { uri: string; cid: string },
  actor: string | null,
  ownDid: string | null,
): UseLike {
  // The store changes as a whole; re-render on any change and read the
  // derived values (cheap) below.
  useSyncExternalStore(subscribe, () => version, () => 0)

  useEffect(() => {
    requestCount(subject.uri)
  }, [subject.uri])
  useEffect(() => {
    if (actor) requestOwn(actor)
  }, [actor])

  const toggleLike = useCallback(async () => {
    if (!actor || !ownDid) return
    await toggle(ownDid, actor, subject)
  }, [actor, ownDid, subject])

  return {
    count: shownCount(subject.uri, actor),
    liked: actor ? !!likeUriOf(actor, subject.uri) : false,
    busy: actor ? pending.has(key(actor, subject.uri)) : false,
    toggle: toggleLike,
  }
}

/** Test helper: forget every count, account and pending change. */
export function __resetLikesStore(): void {
  counts.clear()
  queued.clear()
  inFlight.clear()
  own.clear()
  ownInFlight.clear()
  overrides.clear()
  deltas.clear()
  pending.clear()
  unavailableUntil = 0
  if (timer) clearTimeout(timer)
  timer = null
  version = 0
}
