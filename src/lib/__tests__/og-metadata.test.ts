// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Profile / record metadata (QA pass, 2026-10-29):
 * - a profile that definitely doesn't exist answers 404 (notFound), so
 *   made-up handles aren't indexed as soft 404s, while a transient upstream
 *   failure never does;
 * - titles carry " — Certified" on record routes too (the [actor] layout's
 *   plain title stopped the root template from reaching them).
 */

const { resolveHandleViaWellKnown, notFound } = vi.hoisted(() => ({
  resolveHandleViaWellKnown: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("next/navigation", () => ({ notFound }))
vi.mock("@/lib/atproto/did", () => ({
  BSKY_APPVIEW: "https://appview.test",
  resolveHandle: vi.fn(async () => "alice.example.com"),
  resolveHandleViaWellKnown,
}))
vi.mock("@/app/api/resolve-did/resolve-core", () => ({
  buildProfilePayload: vi.fn(async () => ({ handle: "alice.example.com", displayName: "Alice" })),
}))
vi.mock("@/lib/atproto/get-record-server", () => ({
  getRecordServer: vi.fn(async () => ({ value: { title: "Restore the river" } })),
}))

import { profileMetadata, recordMetadata } from "../og-metadata"

type Responder = (url: string) => Response | Promise<Response>
function mockFetch(respond: Responder) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => respond(String(input)))
}
const unableToResolve = () =>
  Response.json({ error: "InvalidRequest", message: "Unable to resolve handle" }, { status: 400 })

beforeEach(() => {
  resolveHandleViaWellKnown.mockReset().mockResolvedValue(null)
  notFound.mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("profileMetadata", () => {
  it("titles a found profile with the site suffix", async () => {
    mockFetch(() => Response.json({ did: "did:plc:alice" }))
    const meta = await profileMetadata("alice.example.com")
    expect(meta.title).toEqual({ absolute: "Alice (@alice.example.com) — Certified" })
    expect(meta.openGraph?.title).toBe("Alice (@alice.example.com)")
  })

  it.each([
    ["an invalid segment", "not-a-handle", () => Response.json({})],
    ["a handle the appView can't resolve and that has no .well-known DID", "nobody.example.com", unableToResolve],
    ["a did:plc that plc.directory doesn't know", "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", () => new Response(null, { status: 404 })],
  ])("404s for %s", async (_label, actor, respond) => {
    mockFetch(respond)
    await expect(profileMetadata(actor)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalled()
  })

  it("finds a handle via .well-known when the appView doesn't know it", async () => {
    mockFetch(unableToResolve)
    resolveHandleViaWellKnown.mockResolvedValue("did:plc:alice")
    const meta = await profileMetadata("alice.example.com")
    expect(notFound).not.toHaveBeenCalled()
    expect(meta.title).toEqual({ absolute: "Alice (@alice.example.com) — Certified" })
  })

  it.each([
    ["the appView errors", () => new Response("oops", { status: 502 })],
    ["the network fails", () => Promise.reject(new TypeError("fetch failed"))],
  ])("never 404s when %s (unknown, not missing)", async (_label, respond) => {
    mockFetch(respond as Responder)
    expect(await profileMetadata("alice.example.com")).toEqual({})
    expect(notFound).not.toHaveBeenCalled()
  })

  it("keeps a did:plc page when plc.directory can't be reached", async () => {
    mockFetch(() => Promise.reject(new TypeError("fetch failed")))
    await profileMetadata("did:plc:alice")
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe("recordMetadata", () => {
  it("titles a record with the site suffix", async () => {
    mockFetch(() => Response.json({ did: "did:plc:alice" }))
    const meta = await recordMetadata("alice.example.com", "activity", "org.hypercerts.claim.activity", "3abc")
    expect(meta.title).toEqual({ absolute: "Restore the river — Certified" })
    expect(meta.openGraph?.title).toBe("Restore the river")
  })

  it("404s when the record's actor doesn't exist", async () => {
    mockFetch(unableToResolve)
    await expect(
      recordMetadata("nobody.example.com", "activity", "org.hypercerts.claim.activity", "3abc"),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
