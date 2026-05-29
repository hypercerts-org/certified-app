import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * quality-028: location.ts must use the shared strict at:// parser
 * (from activity-uri.ts), which rejects URIs with trailing segments
 * (`!== 3`) rather than the old lenient private copy (`< 3`) that
 * silently dropped extras. A 4-segment uri is malformed and must NOT
 * resolve to a record — `readLocationStrongRef` returns null without
 * ever hitting the network.
 */
const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init: RequestInit) => mockAuthFetch(url, init),
}))

beforeEach(() => {
  mockAuthFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("readLocationStrongRef at:// parsing", () => {
  it("returns null for a 4-segment (malformed) uri without fetching", async () => {
    const { readLocationStrongRef } = await import("../location")
    // Correct collection but a trailing garbage segment — the strict
    // shared parser rejects extras, the old lenient copy accepted it.
    const result = await readLocationStrongRef({
      uri: "at://did:plc:abc/app.certified.location/rkey123/garbage",
      cid: "bafyfake",
    })
    expect(result).toBeNull()
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})
