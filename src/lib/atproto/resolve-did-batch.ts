"use client"

import { authFetch } from "@/lib/auth/fetch"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

/**
 * Client-side request coalescer for DID/handle -> profile resolution.
 *
 * The byline + contributor components each need to resolve one identity
 * per row. Firing one `GET /api/resolve-did` per row blows that route's
 * 60/min rate limit on a busy explore page or a contributor-heavy
 * activity, which is what produced the intermittent 429s and stuck
 * avatars (see docs/resolve-did-batch/plan.md).
 *
 * This is a DataLoader-style batcher: individual `loadResolvedProfile`
 * calls within the same render pass are collected and flushed as a
 * single `POST /api/resolve-dids`. A page of K authors costs ceil(K/50)
 * requests instead of K.
 *
 * Resilience: a failed or rate-limited identity resolves to `null`
 * (callers render a fallback) rather than throwing — so a transient 429
 * degrades a byline to its DID instead of looping retries against an
 * already-limited endpoint. Negative results are cached only briefly so
 * the next view re-attempts them.
 */

/** The subset of the resolve payload the byline / name hooks consume.
 *  The wire payload carries more fields; this is intentionally narrow. */
export interface ResolvedDidResult {
  did: string
  handle: string
  displayName?: string
  description?: string
  avatar?: string | null
  banner?: string | null
}

/** Collect a single render pass's worth of loads before flushing. */
const BATCH_WINDOW_MS = 16
/** Mirror the server's per-request cap; larger sets chunk into N POSTs. */
const MAX_BATCH = 50
/** Re-allow a failed identity after this long so views self-heal. */
const NEGATIVE_TTL_MS = 30_000
/** Pause flushing for this long after a 429, then resume. */
const COOLDOWN_MS = 5_000

interface QueueEntry {
  identity: string
  resolve: (value: ResolvedDidResult | null) => void
}

// identity -> settled-or-in-flight promise. A resolved value of `null`
// means "looked up, not resolvable (yet)". Bounded so a long session
// browsing many profiles can't grow the map without limit.
const cache = createBoundedCache<string, Promise<ResolvedDidResult | null>>(
  1000
)

let queue: QueueEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let cooldownUntil = 0
// Per-identity TTL timers for negative-cache eviction, tracked so they
// can be replaced on reschedule and cleared on reset (no timer leak).
const evictionTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Resolve a DID or handle to its profile, batched. Returns the same
 * promise for in-flight / cached identities (dedup), and never rejects —
 * a failure resolves to `null` so callers degrade gracefully.
 */
export function loadResolvedProfile(
  identity: string
): Promise<ResolvedDidResult | null> {
  const key = identity.trim()
  if (!key) return Promise.resolve(null)

  const existing = cache.get(key)
  if (existing) return existing

  const promise = new Promise<ResolvedDidResult | null>((resolve) => {
    queue.push({ identity: key, resolve })
  })
  cache.set(key, promise)
  scheduleFlush()
  return promise
}

function scheduleFlush(): void {
  if (flushTimer) return
  // Honour any active 429 cooldown by pushing the flush out to its end.
  const delay = Math.max(BATCH_WINDOW_MS, cooldownUntil - Date.now())
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, delay)
}

async function flush(): Promise<void> {
  if (queue.length === 0) return
  // A 429 on a concurrent chunk can set a cooldown after this flush was
  // already armed (within the normal 16ms window). Respect it: re-arm for
  // the cooldown's remainder and leave the queue intact so nothing is
  // lost or sent early.
  if (Date.now() < cooldownUntil) {
    scheduleFlush()
    return
  }
  // Drain everything queued so far; new loads during the awaits below
  // accumulate in a fresh queue and schedule their own flush.
  const drained = queue
  queue = []
  for (let i = 0; i < drained.length; i += MAX_BATCH) {
    await sendChunk(drained.slice(i, i + MAX_BATCH))
  }
}

async function sendChunk(chunk: QueueEntry[]): Promise<void> {
  const identities = chunk.map((e) => e.identity)
  try {
    const res = await authFetch("/api/resolve-dids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identities }),
    })

    if (res.status === 429) {
      // Rate-limited: back off so we stop hammering, and degrade this
      // chunk to fallbacks. The negative TTL lets a later render retry
      // once the cooldown has lapsed.
      cooldownUntil = Date.now() + COOLDOWN_MS
      failChunk(chunk)
      return
    }
    if (!res.ok) {
      failChunk(chunk)
      return
    }

    const data = (await res.json()) as {
      results?: Record<string, ResolvedDidResult | null>
    }
    const results = data.results ?? {}
    for (const entry of chunk) {
      const result = results[entry.identity] ?? null
      entry.resolve(result)
      // Positive results stay cached for the session; negatives expire so
      // an identity that wasn't resolvable yet gets another chance.
      if (result === null) scheduleNegativeEviction(entry.identity)
    }
  } catch {
    failChunk(chunk)
  }
}

function failChunk(chunk: QueueEntry[]): void {
  for (const entry of chunk) {
    entry.resolve(null)
    scheduleNegativeEviction(entry.identity)
  }
}

function scheduleNegativeEviction(identity: string): void {
  const cached = cache.get(identity)
  // Replace any pending timer for this identity so retries don't stack.
  const existing = evictionTimers.get(identity)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    evictionTimers.delete(identity)
    // Only evict if this exact negative promise is still cached — never
    // clobber a newer successful re-resolution of the same identity.
    if (cache.get(identity) === cached) cache.delete(identity)
  }, NEGATIVE_TTL_MS)
  evictionTimers.set(identity, timer)
}

/** Test-only: reset all module state between cases. */
export function __resetResolveDidBatchForTests(): void {
  cache.clear()
  queue = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  for (const timer of evictionTimers.values()) clearTimeout(timer)
  evictionTimers.clear()
  cooldownUntil = 0
}
