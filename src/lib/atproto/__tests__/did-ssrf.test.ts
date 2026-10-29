import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { isAllowedPdsUrl, resolveHandleViaWellKnown, resolvePdsUrl } from "../did"

/**
 * sec-ssrf-ip-filter-bypass + sec-ssrf-wellknown-handle: the SSRF gate
 * must reject internal targets in every encoding a resolver would still
 * dial — private/loopback/link-local/CGNAT ranges, non-canonical decimal
 * / hex / octal IPv4 literals, IPv6 loopback/ULA/mapped, and host:port
 * strings — while leaving legitimate PDS hosts reachable. The `.well-known`
 * handle resolver must apply the SAME gate and never issue an outbound
 * fetch for a rejected value.
 */

describe("isAllowedPdsUrl", () => {
  it("rejects non-https schemes", () => {
    expect(isAllowedPdsUrl("http://pds.example.com")).toBe(false)
    expect(isAllowedPdsUrl("ftp://pds.example.com")).toBe(false)
  })

  it("rejects localhost and loopback", () => {
    expect(isAllowedPdsUrl("https://localhost")).toBe(false)
    expect(isAllowedPdsUrl("https://127.0.0.1")).toBe(false)
    expect(isAllowedPdsUrl("https://127.10.20.30")).toBe(false)
  })

  it("rejects RFC1918 / link-local / CGNAT ranges", () => {
    expect(isAllowedPdsUrl("https://10.0.0.5")).toBe(false)
    expect(isAllowedPdsUrl("https://172.16.0.1")).toBe(false)
    expect(isAllowedPdsUrl("https://172.31.255.254")).toBe(false)
    expect(isAllowedPdsUrl("https://192.168.1.1")).toBe(false)
    expect(isAllowedPdsUrl("https://169.254.169.254")).toBe(false)
    expect(isAllowedPdsUrl("https://0.0.0.0")).toBe(false)
    expect(isAllowedPdsUrl("https://100.64.0.1")).toBe(false)
    expect(isAllowedPdsUrl("https://100.127.255.255")).toBe(false)
  })

  it("rejects non-canonical IPv4 literals (decimal / hex / octal / short-form)", () => {
    // 2130706433 === 0x7f000001 === 127.0.0.1
    expect(isAllowedPdsUrl("https://2130706433")).toBe(false)
    expect(isAllowedPdsUrl("https://0x7f000001")).toBe(false)
    expect(isAllowedPdsUrl("https://0x7f.0.0.1")).toBe(false)
    expect(isAllowedPdsUrl("https://0177.0.0.1")).toBe(false)
    expect(isAllowedPdsUrl("https://127.1")).toBe(false)
    // 3232235521 === 192.168.0.1
    expect(isAllowedPdsUrl("https://3232235521")).toBe(false)
  })

  it("rejects a host:port pointing at an internal address", () => {
    expect(isAllowedPdsUrl("https://10.0.2.15:6379")).toBe(false)
    expect(isAllowedPdsUrl("https://127.0.0.1:8443")).toBe(false)
  })

  it("rejects IPv6 loopback / link-local / ULA / unspecified / mapped", () => {
    expect(isAllowedPdsUrl("https://[::1]")).toBe(false)
    expect(isAllowedPdsUrl("https://[::]")).toBe(false)
    expect(isAllowedPdsUrl("https://[fe80::1]")).toBe(false)
    expect(isAllowedPdsUrl("https://[fc00::1]")).toBe(false)
    expect(isAllowedPdsUrl("https://[fd12:3456::1]")).toBe(false)
    expect(isAllowedPdsUrl("https://[::ffff:127.0.0.1]")).toBe(false)
  })

  it("allows legitimate PDS hosts", () => {
    expect(isAllowedPdsUrl("https://bsky.social")).toBe(true)
    expect(isAllowedPdsUrl("https://pds.example.com")).toBe(true)
    expect(isAllowedPdsUrl("https://morel.us-east.host.bsky.network")).toBe(true)
    // A public IPv4 literal is not in any blocked range → still reachable.
    expect(isAllowedPdsUrl("https://93.184.216.34")).toBe(true)
  })
})

describe("resolveHandleViaWellKnown SSRF gate", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "did:plc:abcdefghij234567klmnopqr",
    }))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ["169.254.169.254", "link-local IP literal"],
    ["10.0.2.15:6379", "host:port"],
    ["2130706433", "decimal IP literal (no dot)"],
    ["0x7f.0.0.1", "hex IP literal"],
    ["internal", "single label, no TLD"],
    ["user@evil.com", "userinfo"],
    ["evil.com/path", "path segment"],
    ["evil.com%2f", "percent-encoded char"],
    ["has space.com", "whitespace"],
  ])("rejects %s (%s) without issuing a fetch", async (handle) => {
    const result = await resolveHandleViaWellKnown(handle)
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("resolves a legitimate handle and applies redirect:error", async () => {
    const result = await resolveHandleViaWellKnown("alice.bsky.social")
    expect(result).toBe("did:plc:abcdefghij234567klmnopqr")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://alice.bsky.social/.well-known/atproto-did")
    expect(init).toMatchObject({ redirect: "error" })
  })

  it("returns null when the body is not a DID", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "not-a-did" })
    const result = await resolveHandleViaWellKnown("alice.bsky.social")
    expect(result).toBeNull()
  })
})

// TECH-811: the string gate above can't see what a hostname resolves to
// (e.g. localtest.me → 127.0.0.1). On the server the connection-level guard
// (src/lib/security/ssrf.ts) sits in a process-wide slot that did.ts looks up,
// because did.ts is also bundled for the browser and can't import it.
describe("did.ts uses the server's SSRF-guarded fetch when installed", () => {
  const SLOT = Symbol.for("certified-app.guardedFetch")
  const slot = globalThis as Record<symbol, unknown>
  let saved: unknown

  beforeEach(() => {
    saved = slot[SLOT]
  })
  afterEach(() => {
    slot[SLOT] = saved
    vi.restoreAllMocks()
  })

  it("routes the .well-known handle lookup through the slot", async () => {
    const guarded = vi.fn(async () => new Response("did:plc:abcdefghijklmnopqrstuvwx"))
    const plain = vi.spyOn(globalThis, "fetch")
    slot[SLOT] = guarded

    expect(await resolveHandleViaWellKnown("alice.example.com")).toBe("did:plc:abcdefghijklmnopqrstuvwx")
    expect(guarded).toHaveBeenCalledWith(
      "https://alice.example.com/.well-known/atproto-did",
      expect.objectContaining({ redirect: "error" }),
    )
    expect(plain).not.toHaveBeenCalled()
  })

  it("routes did:web document fetches through the slot", async () => {
    const guarded = vi.fn(async () => Response.json({
      id: "did:web:pds-host.example.com",
      service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: "https://pds-host.example.com" }],
    }))
    slot[SLOT] = guarded

    expect(await resolvePdsUrl("did:web:pds-host.example.com")).toBe("https://pds-host.example.com")
    expect(guarded).toHaveBeenCalledWith(
      "https://pds-host.example.com/.well-known/did.json",
      expect.objectContaining({ redirect: "error" }),
    )
  })

  it("falls back to plain fetch where no guard is installed (the browser; the server fails closed, see did-guard-server.test.ts)", async () => {
    delete slot[SLOT]
    const plain = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("did:plc:abcdefghijklmnopqrstuvwx"))

    await resolveHandleViaWellKnown("bob.example.com")
    expect(plain).toHaveBeenCalledWith("https://bob.example.com/.well-known/atproto-did", expect.anything())
  })
})
