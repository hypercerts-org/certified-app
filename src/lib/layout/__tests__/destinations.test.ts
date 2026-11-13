import { describe, it, expect } from "vitest"
import {
  DESTINATIONS,
  destinationsFor,
  isDestinationActive,
  isTopLevelPath,
} from "../destinations"

describe("destinations", () => {
  it("lists Workspace, then the network, in the one order every surface uses", () => {
    expect(DESTINATIONS.map((d) => d.label)).toEqual(["Workspace", "Feed", "Explore", "Apps"])
    expect(DESTINATIONS.map((d) => d.href)).toEqual(["/home", "/feed", "/explore", "/apps"])
    expect(DESTINATIONS.map((d) => d.group)).toEqual(["workspace", "network", "network", "network"])
  })

  it("shows all four signed in and only Explore and Apps signed out", () => {
    expect(destinationsFor(true)).toHaveLength(4)
    expect(destinationsFor(false).map((d) => d.key)).toEqual(["explore", "apps"])
  })

  it("gives every destination a tour anchor", () => {
    expect(DESTINATIONS.map((d) => d.tour)).toEqual([
      "nav-workspace",
      "nav-feed",
      "nav-explore",
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

  it("keeps Workspace current on the Overview and every Records section", () => {
    const workspace = DESTINATIONS.find((d) => d.key === "workspace")!
    expect(isDestinationActive(workspace, "/home")).toBe(true)
    expect(isDestinationActive(workspace, "/records")).toBe(true)
    expect(isDestinationActive(workspace, "/feed")).toBe(false)
    expect(isDestinationActive({ href: "/help" }, "/help")).toBe(true)
  })

  it("treats the destinations, Records, Settings and Help as top-level pages", () => {
    for (const p of ["/home", "/records", "/feed", "/explore", "/apps", "/settings", "/help"]) {
      expect(isTopLevelPath(p)).toBe(true)
    }
    for (const p of ["/settings/edit-profile", "/create", "/alice.example/activity/3k", null]) {
      expect(isTopLevelPath(p)).toBe(false)
    }
  })
})
