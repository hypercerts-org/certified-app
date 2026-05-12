import { describe, it, expect } from "vitest"
import { TRUSTED_EVALUATORS } from "../trusted-evaluators"

/**
 * Every entry in TRUSTED_EVALUATORS must be a valid ATProto DID.
 * This prevents accidentally committing a malformed string.
 */
const ATPROTO_DID_RE = /^did:(plc|web):[a-z0-9\-.:]+$/i

describe("TRUSTED_EVALUATORS", () => {
  it("is non-empty", () => {
    expect(TRUSTED_EVALUATORS.length).toBeGreaterThan(0)
  })

  it.each(
    TRUSTED_EVALUATORS.map((did, i) => [i, did] as const),
  )("entry %i (%s) matches ATProto DID format", (_index, did) => {
    expect(did).toMatch(ATPROTO_DID_RE)
  })

  it("has no duplicate entries", () => {
    const unique = new Set(TRUSTED_EVALUATORS)
    expect(unique.size).toBe(TRUSTED_EVALUATORS.length)
  })
})
