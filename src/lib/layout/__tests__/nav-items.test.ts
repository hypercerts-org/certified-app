import { describe, it, expect } from "vitest"
import {
  isFollowersKind,
  isGroupsKind,
  networkSectionFor,
  networkSectionsFor,
  parseRecordKind,
  workspaceSectionFor,
} from "../nav-items"

describe("workspaceSectionFor", () => {
  it("is the Overview on /home and the ?kind= section on /records", () => {
    expect(workspaceSectionFor("/home", null)).toBe("overview")
    expect(workspaceSectionFor("/records", "endorsements")).toBe("endorsements")
    expect(workspaceSectionFor("/records", null)).toBe("activities")
    expect(workspaceSectionFor("/feed", null)).toBeNull()
  })
})

describe("parseRecordKind", () => {
  it("opens anything unknown on the first section", () => {
    expect(parseRecordKind("nope")).toBe("activities")
    expect(parseRecordKind("lists")).toBe("lists")
  })

  it("knows the old Groups section, which left the Workspace", () => {
    expect(isGroupsKind("groups")).toBe(true)
    expect(isGroupsKind("lists")).toBe(false)
    expect(isGroupsKind(null)).toBe(false)
  })

  it("knows the old Followers and Following sections, which are on the profile now", () => {
    expect(isFollowersKind("followers")).toBe(true)
    expect(isFollowersKind("following")).toBe(true)
    expect(isFollowersKind("lists")).toBe(false)
    expect(isFollowersKind(null)).toBe(false)
  })
})

describe("Network pages", () => {
  it("finds the page you're on, below it too", () => {
    expect(networkSectionFor("/map")).toBe("map")
    expect(networkSectionFor("/explore/projects")).toBe("explore")
    expect(networkSectionFor("/home")).toBeNull()
  })

  it("leaves the Feed out signed out", () => {
    expect(networkSectionsFor(false).map((s) => s.key)).toEqual(["explore", "graph", "map", "funding"])
  })
})
