import { describe, expect, it } from "vitest"
import { humanizeScopeToken, workScopeTags } from "../activity"
import { formatCoordinates, locationLabel, locationName } from "../location-label"

describe("workScopeTags", () => {
  it("reads a hasAny CEL expression as readable tags", () => {
    expect(
      workScopeTags({
        expression: 'scope.hasAny(["forest_protection", "biodiversity_monitoring", "tree-nursery"])',
      }),
    ).toEqual(["Forest protection", "Biodiversity monitoring", "Tree nursery"])
  })

  it("splits a plain or { scope } string on commas", () => {
    expect(workScopeTags("community, agriculture,disaster-relief")).toEqual([
      "Community",
      "Agriculture",
      "Disaster relief",
    ])
    expect(workScopeTags({ scope: "Mangrove restoration" })).toEqual(["Mangrove restoration"])
  })

  it("shows no tags for an expression it can't read, and drops repeats", () => {
    expect(workScopeTags({ expression: 'scope.hasAll(["a"]) && x > 2' })).toEqual([])
    expect(workScopeTags("water, Water")).toEqual(["Water"])
    expect(workScopeTags(null)).toEqual([])
  })

  it("keeps words as written", () => {
    expect(humanizeScopeToken("local-first AI")).toBe("local-first AI")
    expect(humanizeScopeToken("REDD+")).toBe("REDD+")
  })
})

describe("location labels", () => {
  it("rounds coordinates to two decimals with hemispheres", () => {
    expect(formatCoordinates(9.944868914445339, -85.66965729295856)).toBe("9.94° N, 85.67° W")
    expect(formatCoordinates(-37.98, 174.8)).toBe("37.98° S, 174.80° E")
  })

  it("names a place without its Plus Code, and rounds a name that is a point", () => {
    expect(locationName({ name: "98W3+WH, Xaafuun, Somalia" })).toBe("Xaafuun, Somalia")
    expect(locationName({ name: "9.944868914445339, -85.66965729295856" })).toBe(
      "9.94° N, 85.67° W",
    )
    expect(locationName({ name: "  " })).toBeNull()
  })

  it("falls back to the point's coordinates, never 'Unnamed location'", () => {
    expect(
      locationLabel({ locationType: "coordinate-decimal", location: "-37.98, 174.80" }),
    ).toBe("37.98° S, 174.80° E")
    expect(locationLabel({ locationType: "h3", location: "8928308280fffff" })).toBeNull()
    expect(locationLabel(null)).toBeNull()
  })
})
