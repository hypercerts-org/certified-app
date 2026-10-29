// @vitest-environment node
import { describe, it, expect } from "vitest"

/**
 * Importing the SSRF guard must not change how the rest of the app fetches.
 * undici's package index installs its Agent as the process-wide fetch
 * dispatcher on load; ssrf.ts deep-imports the Agent to avoid that. This file
 * imports nothing else that loads undici.
 */

const GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1")

describe("ssrf.ts", () => {
  it("leaves the process-wide fetch dispatcher alone", async () => {
    expect((globalThis as Record<symbol, unknown>)[GLOBAL_DISPATCHER]).toBeUndefined()
    await import("../ssrf")
    expect((globalThis as Record<symbol, unknown>)[GLOBAL_DISPATCHER]).toBeUndefined()
  })
})
