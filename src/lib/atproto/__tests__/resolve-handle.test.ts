import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * quality-030: resolveHandle must sanity-check the value it strips from
 * `at://` in the DID document's `alsoKnownAs` actually looks like a
 * handle (non-empty, contains a dot, no slash/whitespace) before
 * returning it. A did:web document is attacker-controllable, so an
 * `at://example.com/some/path` entry must NOT leak through as a handle.
 */

function mockFetchOnce(doc: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => doc,
    })),
  )
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("resolveHandle alsoKnownAs validation", () => {
  it("returns null when the at:// value contains a slash (not a handle)", async () => {
    mockFetchOnce({
      id: "did:web:example.com",
      alsoKnownAs: ["at://example.com/some/path"],
    })
    const { resolveHandle } = await import("../did")
    const result = await resolveHandle("did:web:example.com")
    expect(result).toBeNull()
  })

  it("returns null when the at:// value has no dot", async () => {
    mockFetchOnce({
      id: "did:plc:abc",
      alsoKnownAs: ["at://localhost"],
    })
    const { resolveHandle } = await import("../did")
    const result = await resolveHandle("did:plc:abc")
    expect(result).toBeNull()
  })

  it("returns null when the at:// value contains whitespace", async () => {
    mockFetchOnce({
      id: "did:plc:abc",
      alsoKnownAs: ["at://alice .bsky.social"],
    })
    const { resolveHandle } = await import("../did")
    const result = await resolveHandle("did:plc:abc")
    expect(result).toBeNull()
  })

  it("returns null when the at:// value is empty after stripping", async () => {
    mockFetchOnce({
      id: "did:plc:abc",
      alsoKnownAs: ["at://"],
    })
    const { resolveHandle } = await import("../did")
    const result = await resolveHandle("did:plc:abc")
    expect(result).toBeNull()
  })

  it("returns the handle when the at:// value looks like a handle", async () => {
    mockFetchOnce({
      id: "did:plc:abc",
      alsoKnownAs: ["at://alice.bsky.social"],
    })
    const { resolveHandle } = await import("../did")
    const result = await resolveHandle("did:plc:abc")
    expect(result).toBe("alice.bsky.social")
  })
})
