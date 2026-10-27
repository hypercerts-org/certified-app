// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * The group activity route reaches CGS through `groupServiceFetch` (it used
 * to POST with a raw `fetch`, which skipped #createdVia signing). Pins the
 * wire request — URL, method, headers, body — and that the record is signed
 * for the group repo while DELETE passes through untouched.
 */

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"
const CREATED_VIA = "app.certified.signature.defs#createdVia"

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSessionDid: vi.fn(), deleteSession: vi.fn() }))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: () => null }))
vi.mock("@/lib/atproto/service-auth", () => ({ getServiceAuthToken: vi.fn(async () => "token") }))
vi.mock("@/lib/groups/proxy-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/groups/proxy-agent")>()
  return {
    ...actual,
    getAuthenticatedAgent: vi.fn(async () => ({ agent: {}, did: "did:plc:operator0000000000000000" })),
  }
})

let fetchSpy: ReturnType<typeof vi.spyOn>

function request(body: unknown) {
  return { json: async () => body } as unknown as import("next/server").NextRequest
}
const params = { params: Promise.resolve({ groupDid: GROUP_DID }) }

function sent(call = 0) {
  const [url, init] = fetchSpy.mock.calls[call] as [string, RequestInit]
  return { url, init, body: JSON.parse(init.body as string) }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("CREATED_VIA_SIGNING_KEY", KEY_HEX)
  vi.stubEnv("CREATED_VIA_DID", "did:web:certified.app")
  vi.stubEnv("PUBLIC_URL", "https://certified.app")
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ uri: "at://g/c/r", cid: "bafy" }), { status: 200 }),
  )
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("PUT /api/groups/[groupDid]/activity", () => {
  it.each([
    ["createRecord", {}],
    ["putRecord", { rkey: "3abc", swapRecord: "bafyswap" }],
  ])("%s goes through groupServiceFetch with a signed record", async (method, extra) => {
    const { PUT } = await import("../route")
    const res = await PUT(
      request({ ...extra, record: { title: "t", createdAt: "2026-10-27T00:00:00.000Z", junk: 1 } }),
      params,
    )
    expect(res.status).toBe(200)

    const { url, init, body } = sent()
    expect(url).toMatch(new RegExp(`/xrpc/app\\.certified\\.group\\.repo\\.${method}$`))
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers.Authorization).toBe("Bearer token")
    expect(body.repo).toBe(GROUP_DID)
    expect(body.collection).toBe("org.hypercerts.claim.activity")
    if ("swapRecord" in extra) expect(body.swapRecord).toBe("bafyswap")
    expect(body.record).not.toHaveProperty("junk")
    expect(body.record.signatures[0].$type).toBe(CREATED_VIA)
  })
})

describe("DELETE /api/groups/[groupDid]/activity", () => {
  it("sends the delete body unchanged", async () => {
    const { DELETE } = await import("../route")
    await DELETE(request({ rkey: "3abc" }), params)
    const { url, body } = sent()
    expect(url).toMatch(/\/xrpc\/app\.certified\.group\.repo\.deleteRecord$/)
    expect(body).toEqual({ repo: GROUP_DID, collection: "org.hypercerts.claim.activity", rkey: "3abc" })
  })
})
