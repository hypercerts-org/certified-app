// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * `/.well-known/did.json` publishes the record-signing key. 200 + cacheable
 * when signing is ready; 404 (disabled) and 500 (malformed key) are
 * `no-store` so a cached error can't outlive the key being set.
 */

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("PUBLIC_URL", "https://certified.app")
  vi.stubEnv("CREATED_VIA_DID", "did:web:certified.app")
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("GET /.well-known/did.json", () => {
  it("returns the DID document when signing is configured", async () => {
    vi.stubEnv("CREATED_VIA_SIGNING_KEY", KEY_HEX)
    const { GET } = await import("../route")
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("public, max-age=300")
    const doc = await res.json()
    expect(doc["@context"]).toEqual([
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ])
    expect(doc.id).toBe("did:web:certified.app")
    expect(doc.verificationMethod[0].id).toBe("did:web:certified.app#created-via")
    expect(doc.verificationMethod[0].publicKeyMultibase).toMatch(/^zQ3s/)
  })

  it("404s, uncached, when signing is disabled", async () => {
    vi.stubEnv("CREATED_VIA_SIGNING_KEY", "")
    const { GET } = await import("../route")
    const res = await GET()
    expect(res.status).toBe(404)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("500s, uncached, when the key is malformed", async () => {
    vi.stubEnv("CREATED_VIA_SIGNING_KEY", "not-a-key")
    const { GET } = await import("../route")
    const res = await GET()
    expect(res.status).toBe(500)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(await res.json())).not.toContain("not-a-key")
  })

  it("is not rewritten or redirected by the app proxy", async () => {
    const { proxy } = await import("@/proxy")
    const { NextRequest } = await import("next/server")
    const res = await proxy(new NextRequest("https://certified.app/.well-known/did.json"))
    expect(res?.headers.get("location") ?? null).toBeNull()
    expect(res?.headers.get("x-middleware-rewrite") ?? null).toBeNull()
  })
})
