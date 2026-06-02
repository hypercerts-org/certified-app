# Implementation review — round 1 (decisions)

Two reviewers (client-coalescer correctness; server route regression/abuse).
GET extraction confirmed byte-for-byte faithful; brand/lexicon strings moved
verbatim. Decisions below.

## Accepted

1. **Identity-weighted rate limit on the batch route** (server should-fix).
   A 50-identity batch fans out up to ~150 upstream fetches; a flat
   60-*request*/min budget let one IP drive ~9k upstream fetches/min. Fix:
   charge the limiter `cost = identities.length` against a **600-identity/min**
   budget (per IP and per session-DID). 600 supports ~12 full explore pages/min
   of *distinct* authors (the coalescer dedups repeats to cost 0), while
   bounding upstream to ~1800 fetches/min/IP. Implemented via a backward-compatible
   `cost` param on `checkHttpRateLimit` (default 1 → existing routes unchanged;
   `incrby` only when cost > 1; TTL gate generalised `count === 1` → `count === cost`).
   Side benefit: the old route's shared `"anon"` DID bucket meant *all* signed-out
   users shared one 60/min budget — itself a contributor to the reported 429s.
   The batch path gives anonymous users 10x more headroom than the GET path they
   replace.

2. **Honor the 429 cooldown across flushes** (client #3). A flush already armed
   in the 16ms window before a concurrent chunk got 429'd ignored the new
   cooldown. `flush` now defers (re-arms) when `Date.now() < cooldownUntil`
   instead of relying only on `scheduleFlush`.

3. **Track and clear negative-eviction timers** (client #2). Per-identity 30s
   `setTimeout`s were untracked and leaked (and bled across fake-timer tests).
   Now held in a `Map`, replaced on reschedule, and cleared by the reset helper.

4. **New tests**: cooldown-defers-next-flush; a load arriving during an in-flight
   flush (re-entrancy); reset clears eviction timers. Batch-route mocks updated
   for `incrby` + the weighted 429.

## Declined (with rationale)

- **`useAuthorNamesMap` self-heal on a transient miss** (client #1). Making the
  names map re-query a null result requires it to stay in the effect's `missing`
  set, which re-fires `fetchName` → `setTick` on every render → a re-render loop.
  The original (and current) behaviour caches the DID fallback so `missing`
  empties and the effect early-returns. This is pre-existing, not a regression,
  and the synchronous-map sort/search design depends on it. The coalescer still
  batches and negative-caches the underlying request, so there is no storm. Left
  as-is intentionally.

- **Remove dead `error` plumbing in `useAuthorInfo`** (client #4, nit). The
  `.catch`/`error` state is now unreachable because `loadResolvedProfile` never
  rejects, but it's harmless defensive code and `error` is part of the hook's
  public return type (consumers may destructure it). Not worth the churn.

- **Concurrent chunk flushing** (client #5, nit). Sequential `await` per chunk is
  intentional: it keeps the >50-identity case gentle on the very limiter we're
  trying not to trip. Latency cost only applies to pages with >50 distinct
  authors, which are rare.
