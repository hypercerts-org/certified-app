import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * SSRF guards for the onboarding blob-clone route
 * (`POST` /api/onboarding/clone-blob).
 *
 * The route fetches an attacker-influenced `sourceUrl` server-side (with the
 * user's authenticated PDS session behind it), so its whole safety rests on two
 * guards asserted here:
 *   1. Host allowlist — only `https://cdn.bsky.app` is fetched; every internal
 *      / disallowed host (metadata IP, localhost, private ranges, other CDNs)
 *      is rejected BEFORE any outbound request, and non-https is rejected too.
 *   2. `redirect: "error"` — the outbound fetch refuses to follow a 30x, so an
 *      allowed host cannot bounce the server to an internal target.
 *
 * We drive the real handler with the auth / OAuth / Agent seams mocked and spy
 * on `fetch`, asserting the outbound request is only ever made (and only ever
 * with `redirect: "error"`) for an allowed host.
 */

const { uploadBlobMock } = vi.hoisted(() => ({ uploadBlobMock: vi.fn() }))

vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => "did:plc:alice"),
  deleteSession: vi.fn(async () => undefined),
}))
vi.mock("@/lib/auth/oauth-client", () => ({
  getOAuthClient: vi.fn(async () => ({
    restore: vi.fn(async () => ({ sub: "did:plc:alice" })),
  })),
}))
vi.mock("@atproto/api", () => ({
  Agent: class {
    com = { atproto: { repo: { uploadBlob: uploadBlobMock } } }
  },
}))

import { checkCsrf } from "@/lib/auth/csrf"
import { getSessionDid } from "@/lib/auth/session"

const ALLOWED = "https://cdn.bsky.app/img/avatar/plain/did/cid@jpeg"

function makeRequest(body?: unknown): Request {
  return new Request("https://example.test/api/onboarding/clone-blob", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://example.test",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function post(body?: unknown): Promise<Response> {
  const { POST } = await import("../route")
  return POST(makeRequest(body) as unknown as Parameters<typeof POST>[0])
}

function imageResponse(
  bytes: Uint8Array,
  contentType = "image/png",
): Response {
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: { "content-type": contentType },
  })
}

beforeEach(() => {
  vi.mocked(getSessionDid).mockReset().mockResolvedValue("did:plc:alice")
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  uploadBlobMock
    .mockReset()
    .mockResolvedValue({ data: { blob: { $type: "blob", ref: "bafy" } } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("clone-blob SSRF — host allowlist rejects internal/disallowed hosts", () => {
  const blocked = [
    ["the cloud metadata IP", "https://169.254.169.254/latest/meta-data/"],
    ["loopback by name", "https://localhost/x.png"],
    ["a private RFC1918 host", "https://10.0.0.5/x.png"],
    ["a decimal-IP loopback literal", "https://2130706433/x.png"],
    ["an unrelated CDN", "https://cdn.evil.example/x.png"],
    ["a look-alike subdomain of the allowed host", "https://cdn.bsky.app.evil.example/x.png"],
  ] as const

  for (const [label, url] of blocked) {
    it(`rejects ${label} with 400 and makes NO outbound request`, async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      const res = await post({ sourceUrl: url })
      expect(res.status).toBe(400)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(uploadBlobMock).not.toHaveBeenCalled()
    })
  }

  it("rejects a non-https URL on the allowed host with 400 and makes NO outbound request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await post({ sourceUrl: "http://cdn.bsky.app/x.png" })
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects a malformed sourceUrl with 400 and makes NO outbound request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await post({ sourceUrl: "not a url" })
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("clone-blob SSRF — allowed host is fetched with redirect:error", () => {
  it("fetches the allowed host with redirect:'error' and clones the blob", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(imageResponse(new Uint8Array([1, 2, 3])))

    const res = await post({ sourceUrl: ALLOWED })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ blob: { $type: "blob", ref: "bafy" } })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe(ALLOWED)
    // The anti-redirect-SSRF guard: a 30x to an internal host must not be
    // followed, so the outbound fetch is pinned to redirect:"error".
    expect((init as RequestInit).redirect).toBe("error")
    expect(uploadBlobMock).toHaveBeenCalledTimes(1)
  })

  it("fails closed (502) when the source fetch throws — e.g. a blocked redirect", async () => {
    // With redirect:"error", undici throws on a 30x; the route must surface a
    // 502 and never proceed to upload.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("redirect not allowed"),
    )
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const res = await post({ sourceUrl: ALLOWED })
    expect(res.status).toBe(502)
    expect(uploadBlobMock).not.toHaveBeenCalled()
  })
})

describe("clone-blob — content-type + size caps on the fetched bytes", () => {
  it("rejects a non-image content-type with 415 and never uploads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      imageResponse(new Uint8Array([1]), "text/html"),
    )
    const res = await post({ sourceUrl: ALLOWED })
    expect(res.status).toBe(415)
    expect(uploadBlobMock).not.toHaveBeenCalled()
  })

  it("rejects bytes larger than 4MB with 413 and never uploads", async () => {
    const tooBig = new Uint8Array(4 * 1024 * 1024 + 1)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(imageResponse(tooBig))
    const res = await post({ sourceUrl: ALLOWED })
    expect(res.status).toBe(413)
    expect(uploadBlobMock).not.toHaveBeenCalled()
  })
})

describe("clone-blob — gate", () => {
  it("returns the CSRF response before touching auth or fetch", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await post({ sourceUrl: ALLOWED })
    expect(res.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("401s without a session and makes NO outbound request", async () => {
    vi.mocked(getSessionDid).mockResolvedValueOnce(null)
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await post({ sourceUrl: ALLOWED })
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("400s when sourceUrl is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await post({})
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
