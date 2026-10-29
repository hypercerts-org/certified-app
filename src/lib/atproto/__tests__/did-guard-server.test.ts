// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest"

/**
 * TECH-811: on the server, did.ts must never fall back to an unguarded fetch.
 * If the SSRF guard's slot is empty (instrumentation didn't run), the lookup
 * fails closed instead. The browser fallback is covered in did-ssrf.test.ts.
 */

import { resolveHandleViaWellKnown, resolvePdsUrl } from "../did"

const SLOT = Symbol.for("certified-app.guardedFetch")

afterEach(() => {
  vi.restoreAllMocks()
})

describe("did.ts on the server without the guard installed", () => {
  it("does not fetch, and resolves nothing", async () => {
    delete (globalThis as Record<symbol, unknown>)[SLOT]
    const plain = vi.spyOn(globalThis, "fetch")
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(await resolveHandleViaWellKnown("alice.example.com")).toBeNull()
    expect(await resolvePdsUrl("did:web:unguarded-host.example.com")).toBeNull()
    expect(plain).not.toHaveBeenCalled()
  })
})
