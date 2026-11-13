import { describe, it, expect } from "vitest"
import {
  DESTINATIONS,
  destinationsFor,
  isDestinationActive,
  isTopLevelPath,
} from "../destinations"

describe("destinations", () => {
  it("lists Workspace, then Network and Apps, in the one order every surface uses", () => {
    expect(DESTINATIONS.map((d) => d.label)).toEqual(["Workspace", "Network", "Apps"])
    expect(DESTINATIONS.map((d) => d.href)).toEqual(["/home", "/feed", "/apps"])
    expect(DESTINATIONS.map((d) => d.group)).toEqual(["workspace", "network", "network"])
  })

  it("shows all three signed in; signed out, Network (opening on Explore) and Apps", () => {
    expect(destinationsFor(true)).toHaveLength(3)
    const out = destinationsFor(false)
    expect(out.map((d) => d.key)).toEqual(["network", "apps"])
    expect(out[0].href).toBe("/explore")
  })

  it("gives every destination a tour anchor", () => {
    expect(DESTINATIONS.map((d) => d.tour)).toEqual(["nav-workspace", "nav-network", "nav-apps"])
  })

  it("marks a destination current on its page and the pages under it", () => {
    const apps = DESTINATIONS.find((d) => d.key === "apps")!
    expect(isDestinationActive(apps, "/apps")).toBe(true)
    expect(isDestinationActive(apps, "/apps/some-app")).toBe(true)
    expect(isDestinationActive(apps, "/appsx")).toBe(false)
    expect(isDestinationActive(apps, "/home")).toBe(false)
    expect(isDestinationActive(apps, null)).toBe(false)
  })

  it("keeps Network current on its four tabs", () => {
    const network = DESTINATIONS.find((d) => d.key === "network")!
    for (const p of ["/feed", "/explore", "/explore/accounts", "/graph", "/map"]) {
      expect(isDestinationActive(network, p)).toBe(true)
    }
    expect(isDestinationActive(network, "/apps")).toBe(false)
  })

  it("keeps Workspace current on the Overview and every Records section", () => {
    const workspace = DESTINATIONS.find((d) => d.key === "workspace")!
    expect(isDestinationActive(workspace, "/home")).toBe(true)
    expect(isDestinationActive(workspace, "/records")).toBe(true)
    expect(isDestinationActive(workspace, "/feed")).toBe(false)
    expect(isDestinationActive({ href: "/help" }, "/help")).toBe(true)
  })

  it("treats the destinations, Records, Settings and Help as top-level pages", () => {
    for (const p of ["/home", "/records", "/feed", "/explore", "/graph", "/map", "/apps", "/settings", "/help"]) {
      expect(isTopLevelPath(p)).toBe(true)
    }
    for (const p of ["/settings/edit-profile", "/create", "/alice.example/activity/3k", null]) {
      expect(isTopLevelPath(p)).toBe(false)
    }
  })
})
