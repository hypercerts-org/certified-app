// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { resolvePostSigninPath } from "../post-signin"

const PATH_KEY = "post-signin-path"

describe("resolvePostSigninPath", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it("lands on /home when signing in from the marketing landing", () => {
    sessionStorage.setItem(PATH_KEY, "/welcome")
    expect(resolvePostSigninPath("did:plc:abc")).toBe("/home")
  })

  it("lands on /home from any marketing/legal route", () => {
    for (const route of ["/welcome", "/terms", "/privacy", "/imprint"]) {
      sessionStorage.setItem(PATH_KEY, route)
      expect(resolvePostSigninPath("did:plc:abc")).toBe("/home")
    }
  })

  it("lands on /home when no prior path was stashed", () => {
    expect(resolvePostSigninPath("did:plc:abc")).toBe("/home")
  })

  it("preserves a non-marketing prior location", () => {
    sessionStorage.setItem(PATH_KEY, "/explore")
    expect(resolvePostSigninPath("did:plc:abc")).toBe("/explore")
  })
})
