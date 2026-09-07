import { getRedis } from "./stores"

/**
 * Per-DID write rate limiter for endorsement-issuance lexicons —
 * raises the bar against the harassment pattern flagged in
 * docs/badge-response-flow/plan.md §"Out of scope" D1 (an issuer
 * could mint thousands of badge.award records targeting a single
 * recipient).
 *
 * Strategy: simple fixed-window counter in Upstash KV, one bucket
 * per hour per DID. INCR + EXPIRE on first hit (atomic enough at
 * our scale — Upstash's INCR returns the post-increment value).
 *
 * **Per-DID, not per-IP.** Attackers controlling N DIDs get N× the
 * budget. This is not a complete Sybil defense — it's friction
 * against a single account spamming. Future work: cross-DID limits
 * via shared-IP buckets, ML-based abuse detection, or invite-gated
 * issuance. None of that ships in this PR.
 *
 * Caps chosen for legitimate use:
 *   - 500 writes / hour : the bulk-paste endorsement flow on
 *     endorsement-list detail pages can issue 100+ awards in one
 *     pass when a curator imports a community list. 500/h keeps the
 *     full bulk-paste flow uninterrupted while still tripping on a
 *     sustained scripted attack (thousands per hour).
 *   - 2000 writes / day : catches the "drip N/hour all day" pattern
 *     that the hourly cap misses. Sized 4x the hourly so a viewer
 *     who actually batches at the hourly cap doesn't double-trip on
 *     the daily ceiling.
 */

const HOURLY_LIMIT = 500
const DAILY_LIMIT = 2000
const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * HOUR_SECONDS

export interface RateLimitResult {
  allowed: boolean
  /** Approx remaining capacity in the most-restrictive window. */
  remaining: number
  /** Unix ms when the most-restrictive window resets. */
  resetAt: number
}

/**
 * Increment the per-DID counters and return whether the write is
 * allowed. Call this once per attempted write; on a 429 the
 * counter has still been incremented (intentional — keeps a
 * burst attacker on the same trajectory).
 */
export async function checkAndIncrementWriteRate(
  did: string,
  scope: "endorsement-issue" | "endorsement-response" | "funding-receipt",
): Promise<RateLimitResult> {
  const redis = getRedis()
  const nowSec = Math.floor(Date.now() / 1000)
  const hourBucket = Math.floor(nowSec / HOUR_SECONDS)
  const dayBucket = Math.floor(nowSec / DAY_SECONDS)

  const hourKey = `rate:${scope}:${did}:h:${hourBucket}`
  const dayKey = `rate:${scope}:${did}:d:${dayBucket}`

  // Sequential pair — Upstash REST doesn't offer transactional
  // multi here. At the volumes we're protecting against, a small
  // window for two near-simultaneous calls to both succeed is
  // acceptable; the abuse pattern is sustained, not one-shot.
  const [hourCount, dayCount] = await Promise.all([
    redis.incr(hourKey),
    redis.incr(dayKey),
  ])
  // Set TTL on first hit only — typed as side-effecting in parallel
  // so we don't add latency. Add a small buffer so the bucket
  // outlives the wall-clock window slightly.
  await Promise.all([
    hourCount === 1 ? redis.expire(hourKey, HOUR_SECONDS + 60) : Promise.resolve(0),
    dayCount === 1 ? redis.expire(dayKey, DAY_SECONDS + 300) : Promise.resolve(0),
  ])

  const hourlyAllowed = hourCount <= HOURLY_LIMIT
  const dailyAllowed = dayCount <= DAILY_LIMIT
  const allowed = hourlyAllowed && dailyAllowed

  // The "reset" the client cares about is whichever window blocked.
  const hourReset = (hourBucket + 1) * HOUR_SECONDS * 1000
  const dayReset = (dayBucket + 1) * DAY_SECONDS * 1000
  const resetAt = !hourlyAllowed
    ? hourReset
    : !dailyAllowed
      ? dayReset
      : Math.min(hourReset, dayReset)

  const remaining = !allowed
    ? 0
    : Math.min(HOURLY_LIMIT - hourCount, DAILY_LIMIT - dayCount)

  return { allowed, remaining, resetAt }
}

/**
 * Limits that apply per-collection. Add new entries here as new
 * lexicons earn rate-limiting; right now only the endorsement-
 * issuance lexicons qualify. badge.response is intentionally NOT
 * limited — it's the recipient's *defensive* action, never spam.
 */
export const RATE_LIMITED_WRITE_COLLECTIONS: Record<
  string,
  "endorsement-issue" | "funding-receipt"
> = {
  "app.certified.badge.award": "endorsement-issue",
  // Funding receipts share the same generous per-DID caps as endorsement
  // issuance — high enough never to trip a legitimate recorder, low enough
  // to blunt a scripted flood of fake receipts naming a target.
  "org.hypercerts.funding.receipt": "funding-receipt",
}

// ============================================================================
// HTTP-layer rate limiter (issue #70)
// ============================================================================
//
// Generic per-(name, identifier) sliding-window limiter for the
// auth-touching API routes. Layered on TOP of the per-DID write
// limiter above — that one guards the endorsement-issuance
// lexicon writes specifically; this one guards arbitrary HTTP
// endpoints (login, feedback, search, etc.) by IP or DID.
//
// Distinct key prefix (`rl:` here, `rate:` above) so buckets never
// collide across the two limiters even when they share an
// identifier.
//
// Response shape matches the existing XRPC proxy 429 shape:
//   - body: { error: string, resetAt: number }
//   - headers: Retry-After, X-RateLimit-Reset

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export interface HttpRateLimit {
  /** Used as the bucket key prefix. Distinct per route so budgets
   *  don't share across routes. */
  name: string
  /** Maximum number of requests allowed in `windowSec`. */
  max: number
  /** Window size in seconds. */
  windowSec: number
}

export interface HttpRateLimitResult {
  allowed: boolean
  /** Approximate remaining capacity in the current window. */
  remaining: number
  /** Unix ms when the current window resets. */
  resetAt: number
}

/**
 * Helper to declare a limit once at module scope and reuse it
 * across route invocations. Returned object is pure data — no
 * preconnect or Redis state, just the limit shape.
 */
export function makeLimiter(
  name: string,
  max: number,
  windowSec: number,
): HttpRateLimit {
  return { name, max, windowSec }
}

/**
 * INCR + EXPIRE the bucket for `(limit.name, identifier)`. Same
 * fixed-window strategy as `checkAndIncrementWriteRate` above —
 * not a true sliding window, but simple, atomic-enough at our
 * scale, and consistent with the existing limiter's behaviour. */
export async function checkHttpRateLimit(
  limit: HttpRateLimit,
  identifier: string,
  cost = 1,
): Promise<HttpRateLimitResult> {
  const redis = getRedis()
  const nowSec = Math.floor(Date.now() / 1000)
  const bucket = Math.floor(nowSec / limit.windowSec)
  const key = `rl:${limit.name}:${identifier}:${bucket}`

  // `cost` lets a single request consume more than one unit of budget —
  // used by batch routes that fan out to several upstream fetches per
  // request, so the budget bounds total upstream load rather than request
  // count. cost===1 keeps the exact INCR-by-one path every existing
  // caller relies on (and the test mocks that only stub `incr`).
  const count =
    cost === 1 ? await redis.incr(key) : await redis.incrby(key, cost)
  // The bucket-creating call is the one whose post-increment count equals
  // its own cost (the prior value was 0). Generalises the old `count === 1`
  // so the TTL is still set exactly once per window.
  if (count === cost) {
    // Set TTL once on first hit; +60s buffer so the bucket outlives
    // the wall-clock window slightly. Don't await — fire and forget
    // since the count is what we care about.
    void redis.expire(key, limit.windowSec + 60).catch(() => undefined)
  }

  const allowed = count <= limit.max
  const resetAt = (bucket + 1) * limit.windowSec * 1000
  const remaining = allowed ? Math.max(0, limit.max - count) : 0
  return { allowed, remaining, resetAt }
}

/**
 * Check N limits in parallel against N identifiers; deny if ANY
 * exceeds its budget. Used for "DID AND IP" enforcement on routes
 * where a session-DID rotation alone would bypass the limit (see
 * #70 H5: cheap to spin up a new did:plc). Both buckets INCR even
 * on denial so a burst attacker stays on the same trajectory. */
export async function checkHttpRateLimitMulti(
  pairs: { limit: HttpRateLimit; identifier: string; cost?: number }[],
): Promise<HttpRateLimitResult> {
  const results = await Promise.all(
    pairs.map((p) => checkHttpRateLimit(p.limit, p.identifier, p.cost ?? 1)),
  )
  // Deny if any pair tripped. resetAt = the earliest reset across
  // the denied buckets (so Retry-After reflects when SOMETHING
  // unblocks — not necessarily everything).
  const deniedResults = results.filter((r) => !r.allowed)
  const allowed = deniedResults.length === 0
  const resetAt = allowed
    ? Math.min(...results.map((r) => r.resetAt))
    : Math.min(...deniedResults.map((r) => r.resetAt))
  const remaining = allowed
    ? Math.min(...results.map((r) => r.remaining))
    : 0
  return { allowed, remaining, resetAt }
}

/**
 * Build the canonical 429 response. Shape matches the existing XRPC
 * proxy 429 (`{error, resetAt}` + `Retry-After` + `X-RateLimit-Reset`)
 * so the client-side error handling stays uniform. */
export function rateLimitResponse(
  result: HttpRateLimitResult,
  message = "Too many requests — try again later.",
): NextResponse {
  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  )
  return NextResponse.json(
    { error: message, resetAt: result.resetAt },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    },
  )
}

/**
 * Convenience wrapper: run the limiter and return a 429 response if
 * denied, or null if allowed. Lets each route do:
 *
 *   const denied = await enforceRateLimit(LIMITER, ip)
 *   if (denied) return denied
 *
 * which is one line + a guard. The dual-identifier variant uses
 * `enforceRateLimitMulti` below. */
export async function enforceRateLimit(
  limit: HttpRateLimit,
  identifier: string,
  message?: string,
): Promise<NextResponse | null> {
  try {
    const result = await checkHttpRateLimit(limit, identifier)
    if (!result.allowed) return rateLimitResponse(result, message)
    return null
  } catch (err) {
    // Same fail-open behaviour as the per-DID limiter above: if
    // Redis is unreachable, don't block legitimate traffic. The
    // route should still log via its own error pipeline; we don't
    // import logSafe here to keep this module dependency-light.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[rate-limit] check failed (${limit.name}, ${identifier})`,
        err,
      )
    }
    return null
  }
}

export async function enforceRateLimitMulti(
  pairs: { limit: HttpRateLimit; identifier: string; cost?: number }[],
  message?: string,
): Promise<NextResponse | null> {
  try {
    const result = await checkHttpRateLimitMulti(pairs)
    if (!result.allowed) return rateLimitResponse(result, message)
    return null
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[rate-limit] multi-check failed", err)
    }
    return null
  }
}

// ============================================================================
// Group BFF write limiter (HYPER-575)
// ============================================================================

/**
 * Enforce the per-collection write limit on a group BFF route. Returns a
 * 429 to hand straight back to the client, or null when the write may
 * proceed.
 *
 * Why routes need this at all: the per-DID limiter above is applied by the
 * xrpc proxy, which every group BFF route bypasses BY DESIGN -- they proxy
 * through `app.certified.group.repo.createRecord` instead of
 * `com.atproto.repo.createRecord`. So a group route writing a collection in
 * `RATE_LIMITED_WRITE_COLLECTIONS` is unlimited unless it calls this. Both
 * sides of that coupling look correct in isolation, which is exactly how
 * `funding/route.ts` went unlimited (HYPER-575);
 * `src/app/api/groups/__tests__/write-rate-limit-contract.test.ts` pins the
 * pair.
 *
 * `did` must be the ACTING operator, not the group, so one operator cannot
 * launder a flood through a group account -- the same key the xrpc proxy
 * uses on the personal path, so the two share one budget rather than
 * offering two.
 *
 * Fails open: a limiter backend error hands `err` to `onError` and allows
 * the write. This is hardening, not an authorisation gate -- CGS owns
 * authorisation. `onError` rather than a logger import so this module stays
 * dependency-light and the route logs through its own pipeline, matching
 * `enforceRateLimit` above.
 */
export async function enforceWriteRateLimit(
  did: string,
  collection: string,
  onError: (err: unknown) => void,
): Promise<NextResponse | null> {
  const scope = RATE_LIMITED_WRITE_COLLECTIONS[collection]
  if (!scope) return null
  try {
    const rate = await checkAndIncrementWriteRate(did, scope)
    if (rate.allowed) return null
    return rateLimitResponse(rate, "Too many writes — try again later.")
  } catch (err) {
    onError(err)
    return null
  }
}

// Re-export NextRequest type for consumers' convenience.
export type { NextRequest }
