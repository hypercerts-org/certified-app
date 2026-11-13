import { describe, it, expect } from "vitest"
import { isBottomNavVisible } from "../bottom-nav-visibility"

describe("isBottomNavVisible", () => {
  it("shows on every phone page, in a browser tab as well as the installed app", () => {
    for (const pathname of ["/home", "/feed", "/explore", "/records", "/apps", "/settings", "/help", "/alice.certified.app", "/create"]) {
      expect(isBottomNavVisible({ pathname, isDesktop: false })).toBe(true)
    }
  })

  it("never shows on desktop", () => {
    expect(isBottomNavVisible({ pathname: "/home", isDesktop: true })).toBe(false)
    expect(isBottomNavVisible({ pathname: "/explore", isDesktop: true })).toBe(false)
  })

  it("stays hidden on the landing page and in embeds", () => {
    expect(isBottomNavVisible({ pathname: "/welcome", isDesktop: false })).toBe(false)
    expect(isBottomNavVisible({ pathname: "/embed", isDesktop: false })).toBe(false)
    expect(isBottomNavVisible({ pathname: "/embed/board/abc", isDesktop: false })).toBe(false)
  })
})
