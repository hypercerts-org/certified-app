import { describe, it, expect } from "vitest"
import { coercePrompt } from "@/app/api/auth/login/route"

// judgment-001: the OAuth `prompt` param is typed "login" | "create" but
// was spread straight into client.authorize without runtime validation, so
// a caller could pass prompt: "none" / "select_account" and change the
// external OAuth contract. Per the decision we silently coerce anything
// outside the allowlist to undefined (no 400). This unit-tests the pure
// coercion that both authorize spread sites now use.
describe("coercePrompt", () => {
  it("passes through allowlisted values", () => {
    expect(coercePrompt("login")).toBe("login")
    expect(coercePrompt("create")).toBe("create")
  })

  it("coerces out-of-set values to undefined (so they are NOT forwarded)", () => {
    expect(coercePrompt("none")).toBeUndefined()
    expect(coercePrompt("select_account")).toBeUndefined()
    expect(coercePrompt("consent")).toBeUndefined()
    expect(coercePrompt("LOGIN")).toBeUndefined()
    expect(coercePrompt("")).toBeUndefined()
  })

  it("coerces missing / non-string values to undefined", () => {
    expect(coercePrompt(undefined)).toBeUndefined()
    expect(coercePrompt(null)).toBeUndefined()
    expect(coercePrompt(42)).toBeUndefined()
    expect(coercePrompt({})).toBeUndefined()
  })

  it("produces a spread that omits prompt entirely when coerced away", () => {
    // Mirrors the `...(safePrompt ? { prompt: safePrompt } : {})` usage at
    // the authorize call sites: a coerced-away value must add no key.
    const safe = coercePrompt("none")
    const spread = { ...(safe ? { prompt: safe } : {}) }
    expect("prompt" in spread).toBe(false)

    const safeOk = coercePrompt("login")
    const spreadOk = { ...(safeOk ? { prompt: safeOk } : {}) }
    expect(spreadOk).toEqual({ prompt: "login" })
  })
})
