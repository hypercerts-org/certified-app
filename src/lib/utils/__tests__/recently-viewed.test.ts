import { describe, it, expect, beforeEach } from "vitest"
import {
  trackRecentlyViewed,
  getRecentlyViewed,
  removeRecentlyViewed,
} from "../recently-viewed"

const STORAGE_KEY = "recently-viewed"

beforeEach(() => {
  localStorage.clear()
})

describe("trackRecentlyViewed / getRecentlyViewed", () => {
  it("starts empty for an unseen kind", () => {
    expect(getRecentlyViewed("user")).toEqual([])
  })

  it("pushes new entries to the front (most-recent-first)", () => {
    trackRecentlyViewed("project", "at://a")
    trackRecentlyViewed("project", "at://b")
    expect(getRecentlyViewed("project")).toEqual(["at://b", "at://a"])
  })

  it("dedupes a re-viewed id by moving it to the front", () => {
    trackRecentlyViewed("user", "did:plc:a")
    trackRecentlyViewed("user", "did:plc:b")
    trackRecentlyViewed("user", "did:plc:a")
    expect(getRecentlyViewed("user")).toEqual(["did:plc:a", "did:plc:b"])
  })

  it("keeps kinds isolated from one another", () => {
    trackRecentlyViewed("user", "did:plc:a")
    trackRecentlyViewed("cert", "at://c")
    expect(getRecentlyViewed("user")).toEqual(["did:plc:a"])
    expect(getRecentlyViewed("cert")).toEqual(["at://c"])
    expect(getRecentlyViewed("project")).toEqual([])
  })

  it("ignores empty ids", () => {
    trackRecentlyViewed("user", "")
    expect(getRecentlyViewed("user")).toEqual([])
  })

  it("caps a kind at 30 entries, dropping the oldest", () => {
    for (let i = 0; i < 35; i++) trackRecentlyViewed("project", `at://${i}`)
    const list = getRecentlyViewed("project")
    expect(list).toHaveLength(30)
    // Most recent is at://34 at the front; the 5 oldest (0..4) were dropped.
    expect(list[0]).toBe("at://34")
    expect(list[list.length - 1]).toBe("at://5")
    expect(list).not.toContain("at://0")
    expect(list).not.toContain("at://4")
  })
})

describe("removeRecentlyViewed", () => {
  it("drops the listed ids while preserving order of the rest", () => {
    trackRecentlyViewed("cert", "at://a")
    trackRecentlyViewed("cert", "at://b")
    trackRecentlyViewed("cert", "at://c")
    // Stored order is c, b, a.
    removeRecentlyViewed("cert", ["at://b"])
    expect(getRecentlyViewed("cert")).toEqual(["at://c", "at://a"])
  })

  it("can drop multiple ids at once", () => {
    trackRecentlyViewed("cert", "at://a")
    trackRecentlyViewed("cert", "at://b")
    trackRecentlyViewed("cert", "at://c")
    removeRecentlyViewed("cert", ["at://a", "at://c"])
    expect(getRecentlyViewed("cert")).toEqual(["at://b"])
  })

  it("is a no-op for an empty id list", () => {
    trackRecentlyViewed("user", "did:plc:a")
    removeRecentlyViewed("user", [])
    expect(getRecentlyViewed("user")).toEqual(["did:plc:a"])
  })

  it("ignores ids that are not present", () => {
    trackRecentlyViewed("user", "did:plc:a")
    removeRecentlyViewed("user", ["did:plc:missing"])
    expect(getRecentlyViewed("user")).toEqual(["did:plc:a"])
  })
})

describe("readAll resilience", () => {
  it("returns empty lists when stored JSON is malformed", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json")
    expect(getRecentlyViewed("user")).toEqual([])
  })

  it("filters out non-string and empty entries from stored data", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: ["did:plc:a", 42, "", null, "did:plc:b"] }),
    )
    expect(getRecentlyViewed("user")).toEqual(["did:plc:a", "did:plc:b"])
  })
})
