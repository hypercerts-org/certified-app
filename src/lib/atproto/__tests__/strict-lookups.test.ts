// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The strict lookups behind the profile / record 404s keep "definitely
 * missing" apart from "the lookup failed": only the first may become a 404,
 * so an outage never hides a real profile or record.
 */

const { resolvePdsUrl, guardedFetch } = vi.hoisted(() => ({
  resolvePdsUrl: vi.fn(),
  guardedFetch: vi.fn(),
}))
vi.mock("@/lib/security/ssrf", () => ({ guardedFetch }))

import { lookupHandleViaWellKnown } from "../did"

const SLOT = Symbol.for("certified-app.guardedFetch")
const slotFetch = vi.fn()

beforeEach(() => {
  ;(globalThis as Record<symbol, unknown>)[SLOT] = slotFetch
  slotFetch.mockReset()
})
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SLOT]
  vi.restoreAllMocks()
})

describe("lookupHandleViaWellKnown", () => {
  it("returns the DID", async () => {
    slotFetch.mockResolvedValue(new Response("did:plc:alice\n"))
    expect(await lookupHandleViaWellKnown("alice.example.com")).toBe("did:plc:alice")
  })

  it.each([
    ["a 404", () => new Response("", { status: 404 })],
    ["a body that isn't a DID", () => new Response("<html>")],
    [
      "a domain that doesn't exist",
      () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })),
    ],
  ])("is missing on %s", async (_label, respond) => {
    slotFetch.mockImplementation(respond as () => Promise<Response>)
    expect(await lookupHandleViaWellKnown("nobody.example.com")).toBe("missing")
  })

  it("is missing for a segment that isn't a hostname", async () => {
    expect(await lookupHandleViaWellKnown("not a host")).toBe("missing")
    expect(slotFetch).not.toHaveBeenCalled()
  })

  it.each([
    ["a 503", () => new Response("", { status: 503 })],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    [
      "a temporary DNS failure",
      () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } })),
    ],
  ])("is unknown on %s", async (_label, respond) => {
    slotFetch.mockImplementation(respond as () => Promise<Response>)
    expect(await lookupHandleViaWellKnown("alice.example.com")).toBeUndefined()
  })
})

describe("lookupRecordServer", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.doMock("../did", () => ({ resolvePdsUrl }))
    resolvePdsUrl.mockReset().mockResolvedValue("https://pds.example")
    guardedFetch.mockReset()
  })

  async function lookup() {
    const { lookupRecordServer } = await import("../get-record-server")
    return lookupRecordServer("did:plc:alice", "org.hypercerts.claim.activity", "3abc")
  }

  it("returns the record", async () => {
    guardedFetch.mockResolvedValue(Response.json({ uri: "at://x", value: { title: "T" } }))
    expect(await lookup()).toEqual({ uri: "at://x", cid: undefined, value: { title: "T" } })
  })

  it("is missing on RecordNotFound", async () => {
    guardedFetch.mockResolvedValue(
      Response.json({ error: "RecordNotFound", message: "Could not locate record" }, { status: 400 }),
    )
    expect(await lookup()).toBe("missing")
  })

  it.each([
    ["another 400", () => Response.json({ error: "InvalidRequest" }, { status: 400 })],
    ["a bare 404", () => new Response("", { status: 404 })],
    ["a 500", () => new Response("", { status: 500 })],
  ])("is unknown on %s", async (_label, respond) => {
    guardedFetch.mockImplementation(async () => respond())
    expect(await lookup()).toBeUndefined()
  })

  it("is unknown when the PDS can't be resolved", async () => {
    resolvePdsUrl.mockResolvedValue(null)
    expect(await lookup()).toBeUndefined()
  })
})
