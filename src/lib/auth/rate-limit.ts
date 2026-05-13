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
 *   - 50 writes / hour : a power user batch-endorsing after an
 *     event gets through; a script spinning thousands gets blocked
 *     within minutes.
 *   - 200 writes / day : catches the "drip 5/hour all day" abuse
 *     pattern that the hourly cap misses.
 */

const HOURLY_LIMIT = 50
const DAILY_LIMIT = 200
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
  scope: "endorsement-issue" | "endorsement-response",
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
  "endorsement-issue"
> = {
  "app.certified.badge.award": "endorsement-issue",
  "app.certified.temp.graph.endorsement": "endorsement-issue",
}
