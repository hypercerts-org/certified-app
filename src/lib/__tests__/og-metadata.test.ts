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

const {
  lookupHandleViaWellKnown,
  lookupIndexerDidByHandle,
  lookupIndexerRecordExists,
  lookupRecordServer,
  resolveTxt,
  notFound,
} = vi.hoisted(() => ({
  lookupHandleViaWellKnown: vi.fn(),
  lookupIndexerDidByHandle: vi.fn(),
  lookupIndexerRecordExists: vi.fn(),
  lookupRecordServer: vi.fn(),
  resolveTxt: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const dnsError = (code: string) => Object.assign(new Error(code), { code })

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("next/navigation", () => ({ notFound }))
vi.mock("@/lib/atproto/did", () => ({
  BSKY_APPVIEW: "https://appview.test",
  resolveHandle: vi.fn(async () => "alice.example.com"),
  lookupHandleViaWellKnown,
  invalidateDidDoc: vi.fn(),
  isHandleSyntax: (handle: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(handle),
}))
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolveTxt = resolveTxt
  },
}))
vi.mock("@/app/api/resolve-did/resolve-core", () => ({
  buildProfilePayload: vi.fn(async () => ({ handle: "alice.example.com", displayName: "Alice" })),
  lookupIndexerDidByHandle,
  lookupIndexerRecordExists,
}))
vi.mock("@/lib/atproto/get-record-server", () => ({ lookupRecordServer }))

import { profileMetadata, recordMetadata } from "../og-metadata"

type Responder = (url: string) => Response | Promise<Response>
function mockFetch(respond: Responder) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => respond(String(input)))
}
const unableToResolve = () =>
  Response.json({ error: "InvalidRequest", message: "Unable to resolve handle" }, { status: 400 })

beforeEach(() => {
  lookupHandleViaWellKnown.mockReset().mockResolvedValue("missing")
  lookupIndexerDidByHandle.mockReset().mockResolvedValue(null)
  lookupIndexerRecordExists.mockReset().mockResolvedValue(false)
  resolveTxt.mockReset().mockRejectedValue(dnsError("ENOTFOUND"))
  lookupRecordServer.mockReset().mockResolvedValue({ uri: "", value: { title: "Restore the river" } })
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
    lookupHandleViaWellKnown.mockResolvedValue("did:plc:alice")
    const meta = await profileMetadata("alice.example.com")
    expect(notFound).not.toHaveBeenCalled()
    expect(meta.title).toEqual({ absolute: "Alice (@alice.example.com) — Certified" })
  })

  it("finds a handle verified only by its DNS TXT record", async () => {
    mockFetch(unableToResolve)
    resolveTxt.mockResolvedValue([["did=did:plc:alice"]])
    await profileMetadata("alice.example.com")
    expect(notFound).not.toHaveBeenCalled()
  })

  it("never 404s when the DNS TXT lookup can't answer, and skips the indexer", async () => {
    mockFetch(unableToResolve)
    resolveTxt.mockRejectedValue(dnsError("ETIMEOUT"))
    expect(await profileMetadata("alice.example.com")).toEqual({})
    expect(notFound).not.toHaveBeenCalled()
    expect(lookupIndexerDidByHandle).not.toHaveBeenCalled()
  })

  it("answers scanner paths without any lookup", async () => {
    const fetchSpy = mockFetch(unableToResolve)
    await expect(profileMetadata("wp-login.php")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(resolveTxt).not.toHaveBeenCalled()
  })

  it("finds a migrated handle via the indexer before calling it missing", async () => {
    mockFetch(unableToResolve)
    lookupIndexerDidByHandle.mockResolvedValue("did:plc:alice")
    await profileMetadata("old-handle.example.com")
    expect(notFound).not.toHaveBeenCalled()
  })

  it.each([
    [".well-known can't be reached", () => lookupHandleViaWellKnown.mockResolvedValue(undefined)],
    ["the indexer can't answer", () => lookupIndexerDidByHandle.mockResolvedValue(undefined)],
  ])("never 404s a handle when %s", async (_label, arrange) => {
    mockFetch(unableToResolve)
    arrange()
    expect(await profileMetadata("alice.example.com")).toEqual({})
    expect(notFound).not.toHaveBeenCalled()
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

  it("404s when the record definitely doesn't exist", async () => {
    mockFetch(() => Response.json({ did: "did:plc:alice" }))
    lookupRecordServer.mockResolvedValue("missing")
    await expect(
      recordMetadata("alice.example.com", "activity", "org.hypercerts.claim.activity", "gone"),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it.each([
    ["the indexer still has a copy", true],
    ["the indexer can't answer", undefined],
  ])("keeps the page when the PDS misses but %s", async (_label, indexed) => {
    mockFetch(() => Response.json({ did: "did:plc:alice" }))
    lookupRecordServer.mockResolvedValue("missing")
    lookupIndexerRecordExists.mockResolvedValue(indexed)
    expect(
      await recordMetadata("alice.example.com", "activity", "org.hypercerts.claim.activity", "3abc"),
    ).toEqual({})
    expect(notFound).not.toHaveBeenCalled()
  })

  it("re-asks the PDS after refreshing the DID doc before calling a record missing", async () => {
    mockFetch(() => Response.json({ did: "did:plc:alice" }))
    lookupRecordServer
      .mockResolvedValueOnce("missing")
      .mockResolvedValueOnce({ uri: "", value: { title: "Moved" } })
    const meta = await recordMetadata("alice.example.com", "activity", "org.hypercerts.claim.activity", "3abc")
    expect(meta.title).toEqual({ absolute: "Moved — Certified" })
    expect(lookupRecordServer).toHaveBeenCalledTimes(2)
  })

  it("keeps the page when the record lookup fails", async () => {
    mockFetch(() => Response.json({ did: "did:plc:alice" }))
    lookupRecordServer.mockResolvedValue(undefined)
    expect(
      await recordMetadata("alice.example.com", "activity", "org.hypercerts.claim.activity", "3abc"),
    ).toEqual({})
    expect(notFound).not.toHaveBeenCalled()
  })

  it("404s when the record's actor doesn't exist", async () => {
    mockFetch(unableToResolve)
    await expect(
      recordMetadata("nobody.example.com", "activity", "org.hypercerts.claim.activity", "3abc"),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
