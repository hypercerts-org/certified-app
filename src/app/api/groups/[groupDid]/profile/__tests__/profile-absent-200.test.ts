import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * GET /api/groups/[groupDid]/profile — absent-profile contract (issue #156).
 *
 * Several feed/list rows reference group DIDs whose
 * `app.certified.actor.profile` record is gone (deleted / never-published)
 * or whose DID no longer resolves to a PDS. Those are EXPECTED absent
 * cases, not failures. The route must answer them with HTTP 200 + a null
 * body — NOT 404 — so the browser doesn't log a red
 * "Failed to load resource: 404" for every gone-group row in the feed.
 *
 * A genuine PDS failure (5xx / network) must stay distinguishable: it
 * still surfaces as a 500 so "absent" and "broken" don't collapse into
 * the same signal.
 *
 * The route pulls in server-only deps (proxy-agent, CSRF) at import time,
 * so we mock those alongside the DID resolver and drive the GET handler.
 */

vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  createGroupAgent: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))
vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(),
}))

import { resolvePdsUrl } from "@/lib/atproto/did"

const GROUP_DID = "did:plc:crmpwlowxpowweitlain3af5"

function makeParams(did: string) {
  return { params: Promise.resolve({ groupDid: did }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/groups/[groupDid]/profile — absent profile (issue #156)", () => {
  it("returns 200 + null when the group DID no longer resolves to a PDS", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValue(null)

    const { GET } = await import("../route")
    const res = await GET(
      new Request(`https://x.test/api/groups/${GROUP_DID}/profile`) as never,
      makeParams(GROUP_DID),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("returns 200 + null when the PDS reports the record absent (404)", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValue("https://pds.test")
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("not found", { status: 404 }))

    const { GET } = await import("../route")
    const res = await GET(
      new Request(`https://x.test/api/groups/${GROUP_DID}/profile`) as never,
      makeParams(GROUP_DID),
    )

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("returns 200 + null when the PDS rejects the record key (400)", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValue("https://pds.test")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 400 }),
    )

    const { GET } = await import("../route")
    const res = await GET(
      new Request(`https://x.test/api/groups/${GROUP_DID}/profile`) as never,
      makeParams(GROUP_DID),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("still surfaces a genuine PDS failure (5xx) as 500, not 200", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValue("https://pds.test")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream down", { status: 503 }),
    )
    // The catch logs via logSafe (console.error) — swallow it so the
    // expected-failure path doesn't pollute test output.
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const { GET } = await import("../route")
    const res = await GET(
      new Request(`https://x.test/api/groups/${GROUP_DID}/profile`) as never,
      makeParams(GROUP_DID),
    )

    expect(res.status).toBe(500)
  })

  it("returns the profile record value verbatim on a hit", async () => {
    vi.mocked(resolvePdsUrl).mockResolvedValue("https://pds.test")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ value: { displayName: "Acme Org" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    const { GET } = await import("../route")
    const res = await GET(
      new Request(`https://x.test/api/groups/${GROUP_DID}/profile`) as never,
      makeParams(GROUP_DID),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ displayName: "Acme Org" })
  })

  it("rejects an invalid DID with 400 (unchanged)", async () => {
    const { GET } = await import("../route")
    const res = await GET(
      new Request("https://x.test/api/groups/not-a-did/profile") as never,
      makeParams("not-a-did"),
    )

    expect(res.status).toBe(400)
  })
})
