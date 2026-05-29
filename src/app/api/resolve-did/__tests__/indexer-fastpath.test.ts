import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Tests for the optional indexer fast-path on GET /api/resolve-did
 * (RESOLVE_DID_USE_INDEXER). The route can read identity (handle + the
 * Bluesky profile block) from the magic-indexer's `actorProfile(did)`
 * GraphQL query instead of fanning out to resolveHandle +
 * app.bsky.actor.getProfile. The certs lookup ALWAYS runs in parallel
 * and its precedence (certs → bsky) is unchanged.
 *
 * Approach: mirror the rate-limit suite — let the real limiter run with
 * a stubbed Redis backend that always allows (incr → 1), stub the
 * atproto/session deps, and mock global fetch. We dispatch fetches by
 * URL so the same mock serves the indexer GraphQL endpoint, the public
 * appView, and the certs PDS getRecord. The route reads
 * RESOLVE_DID_USE_INDEXER at module load, so each test stubs the env
 * and re-imports via vi.resetModules().
 */

const incr = vi.fn().mockResolvedValue(1)
const expire = vi.fn().mockResolvedValue(1)

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => ({ incr, expire }),
}))

vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => null),
}))

const resolveHandle = vi.fn(async () => "legacy-handle.test")
const resolvePdsUrl = vi.fn(async () => null)

vi.mock("@/lib/atproto/did", () => ({
  resolveHandle: (...args: unknown[]) => resolveHandle(...args),
  resolveHandleToDid: vi.fn(async () => null),
  resolvePdsUrl: (...args: unknown[]) => resolvePdsUrl(...args),
}))

const VALID_DID = "did:plc:abcdefghijklmnopqrstuvwx"
const INDEXER_URL = "https://magic-indexer-prod.up.railway.app/graphql"

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

/** Fresh JSON Response per call — bodies are single-use streams. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  incr.mockReset().mockResolvedValue(1)
  expire.mockReset().mockResolvedValue(1)
  resolveHandle.mockReset().mockResolvedValue("legacy-handle.test")
  resolvePdsUrl.mockReset().mockResolvedValue(null)
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

async function getResolve(did: string): Promise<Response> {
  vi.resetModules()
  const { GET } = await import("../route")
  const req = new NextRequest(
    `http://localhost/api/resolve-did?did=${encodeURIComponent(did)}`,
    { headers: { "x-real-ip": "203.0.113.7" } },
  )
  return GET(req)
}

/** True if any fetch call targeted the public bsky appView. */
function appViewWasCalled(): boolean {
  return mockFetch.mock.calls.some((c) =>
    String(c[0]).includes("public.api.bsky.app"),
  )
}

/** True if any fetch call targeted the indexer GraphQL endpoint. */
function indexerWasCalled(): boolean {
  return mockFetch.mock.calls.some((c) => String(c[0]) === INDEXER_URL)
}

describe("/api/resolve-did indexer fast-path", () => {
  describe("flag ON", () => {
    beforeEach(() => {
      vi.stubEnv("RESOLVE_DID_USE_INDEXER", "true")
      vi.stubEnv("INDEXER_URL", INDEXER_URL)
    })

    it("(a) full indexer profile → handle/displayName/avatar/banner come from the indexer; appView NOT called", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (String(url) === INDEXER_URL) {
          return Promise.resolve(
            jsonResponse({
              data: {
                actorProfile: {
                  did: VALID_DID,
                  handle: "indexed.test",
                  displayName: "Indexed Name",
                  description: "from the indexer",
                  avatarCid: "avatarcid123",
                  bannerCid: "bannercid456",
                },
              },
            }),
          )
        }
        // certs PDS getRecord — no certs profile (resolvePdsUrl→null
        // means getCertsProfile bails before any fetch, but be safe).
        return Promise.resolve(new Response("", { status: 404 }))
      })

      const res = await getResolve(VALID_DID)
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.handle).toBe("indexed.test")
      expect(body.displayName).toBe("Indexed Name")
      expect(body.description).toBe("from the indexer")
      // avatar / banner are the buildAvatarUrlFromCid getBlob URLs.
      expect(body.avatar).toBe(
        "/api/xrpc/com/atproto/sync/getBlob?did=" +
          encodeURIComponent(VALID_DID) +
          "&cid=avatarcid123",
      )
      expect(body.banner).toBe(
        "/api/xrpc/com/atproto/sync/getBlob?did=" +
          encodeURIComponent(VALID_DID) +
          "&cid=bannercid456",
      )
      // The indexer supplied a bsky block, so the onboarding seed +
      // hasBlueskyProfile derive from it.
      expect(body.hasBlueskyProfile).toBe(true)
      expect(body.blueskyProfile.displayName).toBe("Indexed Name")

      expect(indexerWasCalled()).toBe(true)
      // The whole point: no fan-out to the appView.
      expect(appViewWasCalled()).toBe(false)
      // The indexer carried the handle, so resolveHandle is skipped too.
      expect(resolveHandle).not.toHaveBeenCalled()
    })

    it("(b) indexer returns handle-only (null bsky fields) → falls back to the appView for the bsky block", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (String(url) === INDEXER_URL) {
          return Promise.resolve(
            jsonResponse({
              data: {
                actorProfile: {
                  did: VALID_DID,
                  handle: "handleonly.test",
                  displayName: null,
                  description: null,
                  avatarCid: null,
                  bannerCid: null,
                },
              },
            }),
          )
        }
        if (String(url).includes("public.api.bsky.app")) {
          return Promise.resolve(
            jsonResponse({
              displayName: "AppView Name",
              description: "from the appview",
              avatar: "https://cdn.bsky.app/avatar.jpg",
              banner: "https://cdn.bsky.app/banner.jpg",
            }),
          )
        }
        return Promise.resolve(new Response("", { status: 404 }))
      })

      const res = await getResolve(VALID_DID)
      expect(res.status).toBe(200)
      const body = await res.json()

      // Handle still came from the indexer.
      expect(body.handle).toBe("handleonly.test")
      // bsky block fell back to the appView.
      expect(body.displayName).toBe("AppView Name")
      expect(body.avatar).toBe("https://cdn.bsky.app/avatar.jpg")
      expect(body.banner).toBe("https://cdn.bsky.app/banner.jpg")
      expect(body.hasBlueskyProfile).toBe(true)
      expect(body.blueskyProfile.displayName).toBe("AppView Name")

      expect(indexerWasCalled()).toBe(true)
      expect(appViewWasCalled()).toBe(true)
    })

    it("(c) indexer query errors → full legacy fallback still produces a correct response", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (String(url) === INDEXER_URL) {
          // Upstream 500 — fetchIndexerActorProfile returns null → the
          // route must fall back to the full legacy path.
          return Promise.resolve(new Response("boom", { status: 500 }))
        }
        if (String(url).includes("public.api.bsky.app")) {
          return Promise.resolve(
            jsonResponse({
              displayName: "Legacy AppView",
              avatar: "https://cdn.bsky.app/legacy.jpg",
            }),
          )
        }
        return Promise.resolve(new Response("", { status: 404 }))
      })

      const res = await getResolve(VALID_DID)
      expect(res.status).toBe(200)
      const body = await res.json()

      // Legacy fan-out: handle from resolveHandle, bsky from appView.
      expect(body.handle).toBe("legacy-handle.test")
      expect(body.displayName).toBe("Legacy AppView")
      expect(body.avatar).toBe("https://cdn.bsky.app/legacy.jpg")
      expect(body.hasBlueskyProfile).toBe(true)

      expect(indexerWasCalled()).toBe(true)
      expect(appViewWasCalled()).toBe(true)
      expect(resolveHandle).toHaveBeenCalled()
    })

    it("certs precedence still wins over the indexer bsky block", async () => {
      // A certified profile exists with a displayName → it must win the
      // merge even though the indexer supplied a bsky displayName.
      resolvePdsUrl.mockResolvedValue("https://pds.example")
      mockFetch.mockImplementation((url: string) => {
        if (String(url) === INDEXER_URL) {
          return Promise.resolve(
            jsonResponse({
              data: {
                actorProfile: {
                  did: VALID_DID,
                  handle: "indexed.test",
                  displayName: "Indexed Name",
                  avatarCid: "avatarcid123",
                },
              },
            }),
          )
        }
        if (String(url).includes("com.atproto.repo.getRecord")) {
          return Promise.resolve(
            jsonResponse({
              value: {
                displayName: "Certified Name",
                description: "certified bio",
              },
            }),
          )
        }
        return Promise.resolve(new Response("", { status: 404 }))
      })

      const res = await getResolve(VALID_DID)
      expect(res.status).toBe(200)
      const body = await res.json()

      // Certs displayName wins; handle still from the indexer.
      expect(body.displayName).toBe("Certified Name")
      expect(body.description).toBe("certified bio")
      expect(body.handle).toBe("indexed.test")
      expect(body.hasCertifiedProfile).toBe(true)
      // The onboarding seed still reflects the bsky/indexer block.
      expect(body.blueskyProfile.displayName).toBe("Indexed Name")
    })
  })

  describe("flag OFF (default)", () => {
    // No RESOLVE_DID_USE_INDEXER stub → defaults to off.
    it("(d) behaviour identical to today: the indexer is NEVER queried", async () => {
      vi.stubEnv("INDEXER_URL", INDEXER_URL)
      mockFetch.mockImplementation((url: string) => {
        if (String(url).includes("public.api.bsky.app")) {
          return Promise.resolve(
            jsonResponse({
              displayName: "AppView Name",
              avatar: "https://cdn.bsky.app/avatar.jpg",
            }),
          )
        }
        return Promise.resolve(new Response("", { status: 404 }))
      })

      const res = await getResolve(VALID_DID)
      expect(res.status).toBe(200)
      const body = await res.json()

      // Legacy fan-out: handle from resolveHandle, bsky from appView.
      expect(body.handle).toBe("legacy-handle.test")
      expect(body.displayName).toBe("AppView Name")
      expect(body.avatar).toBe("https://cdn.bsky.app/avatar.jpg")

      expect(appViewWasCalled()).toBe(true)
      expect(resolveHandle).toHaveBeenCalled()
      // The flag is off — the indexer must never be queried.
      expect(indexerWasCalled()).toBe(false)
    })
  })
})
