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
 *
 * `loadResolvedProfileOutcome` tells the two kinds of `null` apart: the
 * server answered that the identity doesn't resolve (`missing`, a fact),
 * or the lookup itself failed (`failed`: a 429, a network error, a 5xx;
 * unknown, so a caller must not present it as "this account has no
 * name"). A 429's `Retry-After` stretches the cooldown and rides on the
 * failed outcome so a caller can wait it out before retrying.
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

/**
 * What a lookup came to: the profile, the server's answer that the
 * identity doesn't resolve, or a failed lookup (nothing is known).
 */
export type ResolveOutcome =
  | { status: "ok"; profile: ResolvedDidResult }
  | { status: "missing" }
  | {
      status: "failed"
      /** From a 429's `Retry-After`, when the server sent one. */
      retryAfterMs: number | null
    }

/** Collect a single render pass's worth of loads before flushing. */
const BATCH_WINDOW_MS = 16
/** Mirror the server's per-request cap; larger sets chunk into N POSTs. */
const MAX_BATCH = 50
/** Chunks of one flush sent concurrently. The server charges its rate
 *  limit per identity (600/min), so this changes speed, not volume. */
const CHUNK_CONCURRENCY = 3
/** Re-allow a failed identity after this long so views self-heal. */
const NEGATIVE_TTL_MS = 30_000
/** Pause flushing for this long after a 429, then resume. */
const COOLDOWN_MS = 5_000

/** The longest `Retry-After` honoured as a cooldown (the server's
 *  windows are a minute). */
const MAX_RETRY_AFTER_MS = 60_000

interface QueueEntry {
  identity: string
  resolve: (outcome: ResolveOutcome) => void
}

/** One identity's lookup: the outcome, and the same lookup as a profile
 *  or `null` (both promises are stable, so callers can dedupe on them). */
interface CacheEntry {
  outcome: Promise<ResolveOutcome>
  profile: Promise<ResolvedDidResult | null>
}

// identity -> settled-or-in-flight lookup. Bounded so a long session
// browsing many profiles can't grow the map without limit.
const cache = createBoundedCache<string, CacheEntry>(1000)
// Identities whose cached lookup failed (not "missing"): an explicit
// retry may replace these before the negative TTL lapses.
const failedIdentities = new Set<string>()

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
  const entry = loadEntry(identity, false)
  return entry ? entry.profile : Promise.resolve(null)
}

/**
 * The same batched lookup, telling a failed lookup (`failed`, unknown)
 * from an identity that doesn't resolve (`missing`). Never rejects.
 *
 * `retry: true` replaces a cached *failed* lookup with a fresh one (a
 * caller's backoff retry, or the person pressing "Try again"); without
 * it a failure is reused until the negative TTL lapses. A fresh lookup
 * still waits out any 429 cooldown before it is sent.
 */
export function loadResolvedProfileOutcome(
  identity: string,
  opts?: { retry?: boolean },
): Promise<ResolveOutcome> {
  const entry = loadEntry(identity, !!opts?.retry)
  return entry ? entry.outcome : Promise.resolve({ status: "missing" })
}

function loadEntry(identity: string, retryFailed: boolean): CacheEntry | null {
  const key = identity.trim()
  if (!key) return null

  const existing = cache.get(key)
  if (existing && !(retryFailed && failedIdentities.has(key))) return existing
  // A fresh lookup: drop the failed one (and its eviction timer). The
  // failed mark goes either way, in case the bounded cache dropped the
  // entry on its own.
  failedIdentities.delete(key)
  if (existing) {
    cache.delete(key)
    const timer = evictionTimers.get(key)
    if (timer) clearTimeout(timer)
    evictionTimers.delete(key)
  }

  const outcome = new Promise<ResolveOutcome>((resolve) => {
    queue.push({ identity: key, resolve })
  })
  const entry: CacheEntry = {
    outcome,
    profile: outcome.then((o) => (o.status === "ok" ? o.profile : null)),
  }
  cache.set(key, entry)
  scheduleFlush()
  return entry
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
  const chunks: QueueEntry[][] = []
  for (let i = 0; i < drained.length; i += MAX_BATCH) {
    chunks.push(drained.slice(i, i + MAX_BATCH))
  }
  // A few chunks in flight at once: each takes seconds server-side, so a
  // large set (the endorsement graph resolves hundreds) would otherwise
  // wait for every chunk in turn.
  const worker = async () => {
    for (let chunk = chunks.shift(); chunk; chunk = chunks.shift()) {
      // A 429 on a parallel chunk: degrade the rest to fallbacks instead
      // of sending into the cooldown. The negative TTL retries them later.
      if (Date.now() < cooldownUntil) failChunk(chunk, retryAfterRemaining())
      else await sendChunk(chunk)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker),
  )
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
      // Rate-limited: back off so we stop hammering (for as long as the
      // server's Retry-After asks, when it says), and degrade this chunk
      // to fallbacks. The negative TTL lets a later render retry once the
      // cooldown has lapsed.
      const retryAfterMs = parseRetryAfter(res.headers?.get?.("Retry-After") ?? null)
      cooldownUntil = Math.max(
        cooldownUntil,
        Date.now() + Math.max(COOLDOWN_MS, retryAfterMs ?? 0),
      )
      failChunk(chunk, retryAfterMs)
      return
    }
    if (!res.ok) {
      failChunk(chunk, null)
      return
    }

    const data = (await res.json()) as {
      results?: Record<string, ResolvedDidResult | null>
    }
    const results = data.results ?? {}
    for (const entry of chunk) {
      const result = results[entry.identity] ?? null
      entry.resolve(result ? { status: "ok", profile: result } : { status: "missing" })
      // Positive results stay cached for the session; negatives expire so
      // an identity that wasn't resolvable yet gets another chance.
      if (result === null) scheduleNegativeEviction(entry.identity)
    }
  } catch {
    failChunk(chunk, null)
  }
}

function failChunk(chunk: QueueEntry[], retryAfterMs: number | null): void {
  for (const entry of chunk) {
    entry.resolve({ status: "failed", retryAfterMs })
    failedIdentities.add(entry.identity)
    scheduleNegativeEviction(entry.identity)
  }
}

/** What's left of the current 429 cooldown, for chunks failed into it. */
function retryAfterRemaining(): number | null {
  const left = cooldownUntil - Date.now()
  return left > 0 ? left : null
}

/** `Retry-After` in milliseconds: delta-seconds or an HTTP date, capped;
 *  null when absent or unreadable. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  let ms: number
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    ms = Number(trimmed) * 1000
  } else {
    const at = Date.parse(trimmed)
    if (Number.isNaN(at)) return null
    ms = at - Date.now()
  }
  if (!Number.isFinite(ms)) return null
  return Math.min(Math.max(0, Math.round(ms)), MAX_RETRY_AFTER_MS)
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
    if (cache.get(identity) === cached) {
      cache.delete(identity)
      failedIdentities.delete(identity)
    }
  }, NEGATIVE_TTL_MS)
  evictionTimers.set(identity, timer)
}

/** Test-only: reset all module state between cases. */
export function __resetResolveDidBatchForTests(): void {
  cache.clear()
  failedIdentities.clear()
  queue = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  for (const timer of evictionTimers.values()) clearTimeout(timer)
  evictionTimers.clear()
  cooldownUntil = 0
}
