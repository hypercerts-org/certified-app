import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Two things, both about coupling that no single file can see.
 *
 * 1. The per-collection registry. Both write paths look their scope up by
 *    collection name and silently no-op when the lookup misses —
 *    `RATE_LIMITED_WRITE_COLLECTIONS[body.collection]` in the xrpc proxy,
 *    and `enforceWriteRateLimit` on the group BFF routes. Every route suite
 *    that touches either path mocks this module wholesale (the xrpc tests
 *    supply `{}`), so without this file a rename or deletion of an entry
 *    would unlimit those creates on BOTH paths with the suite still green.
 *
 * 2. `enforceWriteRateLimit` itself, which the routes now delegate to. The
 *    route suites mock it, so its 429 shaping and its fail-open behaviour
 *    are only real here.
 *
 * `getRedis` is stubbed rather than the module partially mocked, so the
 * registry and the helper under test are the production ones.
 */

const incr = vi.fn()
const expire = vi.fn().mockResolvedValue(1)
vi.mock("@/lib/auth/stores", () => ({ getRedis: () => ({ incr, expire }) }))

import {
  RATE_LIMITED_WRITE_COLLECTIONS,
  enforceWriteRateLimit,
} from "@/lib/auth/rate-limit"
import { BADGE_AWARD_COLLECTION } from "@/lib/atproto/badges"

const FUNDING_RECEIPT_COLLECTION = "org.hypercerts.funding.receipt"
const DID = "did:plc:operatoraaaaaaaaaaaaaaaa"

beforeEach(() => {
  incr.mockReset()
  expire.mockResolvedValue(1)
})

describe("RATE_LIMITED_WRITE_COLLECTIONS", () => {
  it("rate-limits badge.award under the endorsement-issue scope", () => {
    // Keyed off the lexicon constant the write paths use, so a rename that
    // misses this registry fails here rather than going unlimited.
    expect(RATE_LIMITED_WRITE_COLLECTIONS[BADGE_AWARD_COLLECTION]).toBe(
      "endorsement-issue",
    )
  })

  it("rate-limits funding receipts", () => {
    expect(RATE_LIMITED_WRITE_COLLECTIONS[FUNDING_RECEIPT_COLLECTION]).toBe(
      "funding-receipt",
    )
  })

  it("leaves badge.response unlimited — the recipient's defensive action", () => {
    expect(
      RATE_LIMITED_WRITE_COLLECTIONS["app.certified.badge.response"],
    ).toBeUndefined()
  })
})

describe("enforceWriteRateLimit", () => {
  it("ignores a collection that is not in the registry", async () => {
    const onError = vi.fn()
    const denied = await enforceWriteRateLimit(
      DID,
      "app.certified.badge.response",
      onError,
    )
    expect(denied).toBeNull()
    // No bucket is touched for an unlimited collection.
    expect(incr).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("allows a write under the cap", async () => {
    incr.mockResolvedValue(1)
    const denied = await enforceWriteRateLimit(
      DID,
      BADGE_AWARD_COLLECTION,
      vi.fn(),
    )
    expect(denied).toBeNull()
    // Counted against the DID it was handed, in the scope's bucket.
    expect(incr).toHaveBeenCalledWith(
      expect.stringContaining(`rate:endorsement-issue:${DID}`),
    )
  })

  it("returns a 429 with retry headers once the hourly cap is passed", async () => {
    incr.mockResolvedValue(501) // HOURLY_LIMIT is 500
    const denied = await enforceWriteRateLimit(
      DID,
      BADGE_AWARD_COLLECTION,
      vi.fn(),
    )
    expect(denied).not.toBeNull()
    expect(denied!.status).toBe(429)
    expect(Number(denied!.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(denied!.headers.get("X-RateLimit-Reset")).toBeTruthy()
    const body = await denied!.json()
    expect(body.error).toContain("Too many writes")
    expect(body.resetAt).toBeGreaterThan(0)
  })

  it("fails open and reports when the backend throws", async () => {
    // Hardening, not an authorisation gate: Upstash being down must not
    // block legitimate writes. The route logs through its own pipeline.
    incr.mockRejectedValue(new Error("upstash down"))
    const onError = vi.fn()
    const denied = await enforceWriteRateLimit(
      DID,
      BADGE_AWARD_COLLECTION,
      onError,
    )
    expect(denied).toBeNull()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
  })
})
