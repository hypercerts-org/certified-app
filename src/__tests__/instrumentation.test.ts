// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest"

/** TECH-811: the SSRF guard is installed at server start, so did.ts finds it
 *  even on routes that never import src/lib/security/ssrf.ts. */

const SLOT = Symbol.for("certified-app.guardedFetch")
const slot = globalThis as Record<symbol, unknown>

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("register()", () => {
  it("installs the guarded fetch in the Node runtime", async () => {
    vi.resetModules()
    delete slot[SLOT]
    vi.stubEnv("NEXT_RUNTIME", "nodejs")

    const { register } = await import("../instrumentation")
    await register()
    // Read before importing the guard here: that import fills the slot too.
    const installed = slot[SLOT]
    expect(installed).toBeTypeOf("function")

    const { guardedFetch } = await import("../lib/security/ssrf")
    expect(installed).toBe(guardedFetch)
  })

  it("does nothing in the edge runtime", async () => {
    vi.resetModules()
    delete slot[SLOT]
    vi.stubEnv("NEXT_RUNTIME", "edge")

    const { register } = await import("../instrumentation")
    await register()

    expect(slot[SLOT]).toBeUndefined()
  })
})
