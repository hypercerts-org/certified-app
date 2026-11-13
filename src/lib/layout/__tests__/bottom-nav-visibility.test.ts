import { describe, it, expect } from "vitest"
import { isBottomNavVisible, isFormRoute } from "../bottom-nav-visibility"

describe("isBottomNavVisible", () => {
  it("shows on every phone page, in a browser tab as well as the installed app", () => {
    for (const pathname of [
      "/home",
      "/feed",
      "/explore",
      "/records",
      "/apps",
      "/settings",
      "/help",
      "/alice.certified.app",
      "/alice.certified.app/activity/3kabc",
      "/groups",
    ]) {
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

  it("stays hidden on create and edit forms, which pin their own action bar", () => {
    for (const pathname of [
      "/create",
      "/project/new",
      "/groups/create",
      "/groups/import",
      "/settings/edit-profile",
      "/groups/did:plc:abc/edit-profile",
      "/alice.certified.app/activity/3kabc/edit",
      "/alice.certified.app/project/3kabc/edit",
      "/alice.certified.app/activity/3kabc/update/new",
      "/alice.certified.app/activity/3kabc/update/3kdef/edit",
    ]) {
      expect(isBottomNavVisible({ pathname, isDesktop: false })).toBe(false)
    }
  })
})

describe("isFormRoute", () => {
  it("doesn't mistake a profile or record page for a form", () => {
    expect(isFormRoute("/edit.bsky.social")).toBe(false)
    expect(isFormRoute("/alice.certified.app/activity/3kabc")).toBe(false)
    expect(isFormRoute("/groups/did:plc:abc/settings")).toBe(false)
    expect(isFormRoute(null)).toBe(false)
  })
})
