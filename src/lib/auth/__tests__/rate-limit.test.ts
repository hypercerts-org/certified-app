import { describe, it, expect, vi } from "vitest"

/**
 * Pins the per-collection rate-limit registry.
 *
 * Both write paths that limit endorsement issuance look their scope up by
 * collection name and silently no-op when the lookup misses —
 * `RATE_LIMITED_WRITE_COLLECTIONS[body.collection]` in the xrpc proxy and
 * `RATE_LIMITED_WRITE_COLLECTIONS[BADGE_AWARD_COLLECTION]` in the group
 * endorse BFF route. Every route suite that touches either path mocks this
 * module wholesale (the xrpc tests supply `{}`), so without this file a
 * rename or deletion of an entry here would unlimit badge-award creates on
 * BOTH paths with the whole suite still green.
 */

// The registry is a plain const, but the module's other half builds a Redis
// client via `getRedis`. Stub it so importing for the constant is inert.
vi.mock("@/lib/auth/stores", () => ({ getRedis: () => ({}) }))

import { RATE_LIMITED_WRITE_COLLECTIONS } from "@/lib/auth/rate-limit"
import { BADGE_AWARD_COLLECTION } from "@/lib/atproto/badges"

describe("RATE_LIMITED_WRITE_COLLECTIONS", () => {
  it("rate-limits badge.award under the endorsement-issue scope", () => {
    // Keyed off the lexicon constant the write paths use, so a rename that
    // misses this registry fails here rather than going unlimited.
    expect(RATE_LIMITED_WRITE_COLLECTIONS[BADGE_AWARD_COLLECTION]).toBe(
      "endorsement-issue",
    )
  })

  it("rate-limits funding receipts", () => {
    expect(
      RATE_LIMITED_WRITE_COLLECTIONS["org.hypercerts.funding.receipt"],
    ).toBe("funding-receipt")
  })

  it("leaves badge.response unlimited — the recipient's defensive action", () => {
    expect(
      RATE_LIMITED_WRITE_COLLECTIONS["app.certified.badge.response"],
    ).toBeUndefined()
  })
})
