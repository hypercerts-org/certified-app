import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Tests for the ALL-OR-NOTHING Bluesky fallback rule on
 * GET /api/resolve-did.
 *
 * Product decision: the Bluesky profile is a wholesale fallback, used
 * ONLY when the certs (app.certified.actor.profile) record is absent or
 * completely empty. The moment the certs profile carries ANY meaningful
 * content, its fields are authoritative and we do NOT backfill blanks
 * per-field from Bluesky — an empty field in a partly-filled certs
 * profile is assumed INTENTIONALLY empty.
 *
 * Harness mirrors indexer-fastpath.test.ts: real limiter with a stubbed
 * Redis backend that always allows, stubbed atproto/session deps, and a
 * mocked global fetch dispatched by URL. The flag stays OFF here so the
 * bsky block resolves via the public appView fan-out; the merge
 * precedence under test is independent of how the bsky block is fetched.
 */

const incr = vi.fn().mockResolvedValue(1)
const expire = vi.fn().mockResolvedValue(1)

vi.mock("@/lib/auth/stores", () => ({
  getRedis: () => ({ incr, expire }),
}))

vi.mock("@/lib/auth/session", () => ({
  getSessionDid: vi.fn(async () => null),
}))

const resolveHandle = vi.fn(async (..._args: unknown[]) => "legacy-handle.test")
const resolvePdsUrl = vi.fn(async (..._args: unknown[]) => "https://pds.example")

vi.mock("@/lib/atproto/did", () => ({
  resolveHandle: (...args: unknown[]) => resolveHandle(...args),
  resolveHandleToDid: vi.fn(async () => null),
  resolvePdsUrl: (...args: unknown[]) => resolvePdsUrl(...args),
}))

const VALID_DID = "did:plc:abcdefghijklmnopqrstuvwx"

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
  resolvePdsUrl.mockReset().mockResolvedValue("https://pds.example")
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

describe("/api/resolve-did all-or-nothing bsky fallback", () => {
  it("(i) certs has content but NO certs avatar; bsky has an avatar → avatar is undefined (NOT backfilled from bsky)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("com.atproto.repo.getRecord")) {
        // Partly-filled certs profile: a display name, but no avatar.
        return Promise.resolve(
          jsonResponse({
            value: {
              $type: "app.certified.actor.profile",
              displayName: "Certified Name",
            },
          }),
        )
      }
      if (String(url).includes("public.api.bsky.app")) {
        return Promise.resolve(
          jsonResponse({
            displayName: "Bsky Name",
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

    // certs is authoritative: its displayName is used...
    expect(body.displayName).toBe("Certified Name")
    // ...and the missing avatar/banner are NOT pulled from bsky.
    expect(body.avatar ?? undefined).toBeUndefined()
    expect(body.banner ?? undefined).toBeUndefined()
    expect(body.hasCertifiedProfile).toBe(true)
  })

  it("(ii) certs absent/empty; bsky has displayName + avatar → result uses the bsky values", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("com.atproto.repo.getRecord")) {
        // No certs record at all.
        return Promise.resolve(new Response("", { status: 404 }))
      }
      if (String(url).includes("public.api.bsky.app")) {
        return Promise.resolve(
          jsonResponse({
            displayName: "Bsky Name",
            description: "bsky bio",
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

    expect(body.displayName).toBe("Bsky Name")
    expect(body.description).toBe("bsky bio")
    expect(body.avatar).toBe("https://cdn.bsky.app/avatar.jpg")
    expect(body.banner).toBe("https://cdn.bsky.app/banner.jpg")
    expect(body.hasCertifiedProfile).toBe(false)
    expect(body.hasBlueskyProfile).toBe(true)
  })

  it("(ii-stub) certs record is an empty stub {$type, createdAt}; bsky has values → bsky fallback applies", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("com.atproto.repo.getRecord")) {
        // Stub record carrying no displayed profile fields.
        return Promise.resolve(
          jsonResponse({
            value: {
              $type: "app.certified.actor.profile",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          }),
        )
      }
      if (String(url).includes("public.api.bsky.app")) {
        return Promise.resolve(
          jsonResponse({
            displayName: "Bsky Name",
            avatar: "https://cdn.bsky.app/avatar.jpg",
          }),
        )
      }
      return Promise.resolve(new Response("", { status: 404 }))
    })

    const res = await getResolve(VALID_DID)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.displayName).toBe("Bsky Name")
    expect(body.avatar).toBe("https://cdn.bsky.app/avatar.jpg")
    expect(body.hasCertifiedProfile).toBe(false)
  })

  it("(iii) certs has ONLY a website set → displayName/avatar are undefined (all-or-nothing, not pulled from bsky)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("com.atproto.repo.getRecord")) {
        return Promise.resolve(
          jsonResponse({
            value: {
              $type: "app.certified.actor.profile",
              website: "https://example.com",
            },
          }),
        )
      }
      if (String(url).includes("public.api.bsky.app")) {
        return Promise.resolve(
          jsonResponse({
            displayName: "Bsky Name",
            description: "bsky bio",
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

    // website alone counts as content → certs is authoritative.
    expect(body.website).toBe("https://example.com")
    expect(body.hasCertifiedProfile).toBe(true)
    // None of the bsky-overlappable fields are backfilled.
    expect(body.displayName ?? undefined).toBeUndefined()
    expect(body.description ?? undefined).toBeUndefined()
    expect(body.avatar ?? undefined).toBeUndefined()
    expect(body.banner ?? undefined).toBeUndefined()
  })

  it("(iv) hasCertifiedProfile reflects certsHasContent — true when certs has content beyond displayName, false when empty", async () => {
    // Case A: certs has only a description (no displayName) → still
    // certsHasContent, so hasCertifiedProfile is true under the new rule
    // (the old `!!certs?.displayName` would have reported false).
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("com.atproto.repo.getRecord")) {
        return Promise.resolve(
          jsonResponse({
            value: {
              $type: "app.certified.actor.profile",
              description: "certified bio only",
            },
          }),
        )
      }
      if (String(url).includes("public.api.bsky.app")) {
        return Promise.resolve(
          jsonResponse({
            displayName: "Bsky Name",
            avatar: "https://cdn.bsky.app/avatar.jpg",
          }),
        )
      }
      return Promise.resolve(new Response("", { status: 404 }))
    })

    const resA = await getResolve(VALID_DID)
    expect(resA.status).toBe(200)
    const bodyA = await resA.json()
    expect(bodyA.hasCertifiedProfile).toBe(true)
    expect(bodyA.description).toBe("certified bio only")
    // displayName not backfilled from bsky.
    expect(bodyA.displayName ?? undefined).toBeUndefined()

    // Case B: certs record present but empty stub → hasCertifiedProfile false.
    mockFetch.mockReset()
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("com.atproto.repo.getRecord")) {
        return Promise.resolve(
          jsonResponse({
            value: { $type: "app.certified.actor.profile" },
          }),
        )
      }
      if (String(url).includes("public.api.bsky.app")) {
        return Promise.resolve(
          jsonResponse({
            displayName: "Bsky Name",
            avatar: "https://cdn.bsky.app/avatar.jpg",
          }),
        )
      }
      return Promise.resolve(new Response("", { status: 404 }))
    })

    const resB = await getResolve(VALID_DID)
    expect(resB.status).toBe(200)
    const bodyB = await resB.json()
    expect(bodyB.hasCertifiedProfile).toBe(false)
    // Empty certs → bsky fallback in full.
    expect(bodyB.displayName).toBe("Bsky Name")
    expect(bodyB.avatar).toBe("https://cdn.bsky.app/avatar.jpg")
  })
})
