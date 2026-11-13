import { describe, it, expect } from "vitest"
import {
  DESTINATIONS,
  destinationsFor,
  isDestinationActive,
  isTopLevelPath,
} from "../destinations"

describe("destinations", () => {
  it("lists the five destinations in the one order every surface uses", () => {
    expect(DESTINATIONS.map((d) => d.label)).toEqual(["Home", "Feed", "Explore", "Records", "Apps"])
    expect(DESTINATIONS.map((d) => d.href)).toEqual(["/home", "/feed", "/explore", "/records", "/apps"])
  })

  it("shows all five signed in and only Explore and Apps signed out", () => {
    expect(destinationsFor(true)).toHaveLength(5)
    expect(destinationsFor(false).map((d) => d.key)).toEqual(["explore", "apps"])
  })

  it("gives every destination a tour anchor", () => {
    expect(DESTINATIONS.map((d) => d.tour)).toEqual([
      "nav-home",
      "nav-feed",
      "nav-explore",
      "nav-records",
      "nav-apps",
    ])
  })

  it("marks a destination current on its page and the pages under it", () => {
    const apps = DESTINATIONS.find((d) => d.key === "apps")!
    expect(isDestinationActive(apps, "/apps")).toBe(true)
    expect(isDestinationActive(apps, "/apps/some-app")).toBe(true)
    expect(isDestinationActive(apps, "/appsx")).toBe(false)
    expect(isDestinationActive(apps, "/home")).toBe(false)
    expect(isDestinationActive(apps, null)).toBe(false)
  })

  it("treats the destinations, Settings and Help as top-level pages", () => {
    for (const p of ["/home", "/feed", "/explore", "/records", "/apps", "/settings", "/help"]) {
      expect(isTopLevelPath(p)).toBe(true)
    }
    for (const p of ["/settings/edit-profile", "/create", "/alice.example/activity/3k", null]) {
      expect(isTopLevelPath(p)).toBe(false)
    }
  })
})
