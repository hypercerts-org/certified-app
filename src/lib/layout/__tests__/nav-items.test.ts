import { describe, it, expect } from "vitest"
import {
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
  it("maps the old Following section to Followers and anything unknown to the first", () => {
    expect(parseRecordKind("following")).toBe("followers")
    expect(parseRecordKind("nope")).toBe("activities")
    expect(parseRecordKind("groups")).toBe("groups")
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
