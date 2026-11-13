import { describe, it, expect } from "vitest"
import { routeForActorSwitch, sortGroupsForSwitcher } from "../navigation"
import type { Group } from "../types"

const group = (over: Partial<Group>): Group => ({
  groupDid: "did:plc:g",
  handle: "g.example",
  role: "member",
  accepted: true,
  ...over,
})

describe("routeForActorSwitch", () => {
  const org = group({})

  it("stays on the current page by default", () => {
    expect(routeForActorSwitch("/feed", org)).toBe("/feed")
    expect(routeForActorSwitch("/create", null)).toBe("/create")
  })

  it("keeps Records when switching to a group (the page explains itself)", () => {
    expect(routeForActorSwitch("/records", org)).toBe("/records")
  })

  it("leaves personal-only pages for Home when switching to a group", () => {
    expect(routeForActorSwitch("/create", org)).toBe("/home")
    expect(routeForActorSwitch("/groups/create", org)).toBe("/home")
  })
})

describe("sortGroupsForSwitcher", () => {
  it("orders accepted first, then owner/admin/member, then by name", () => {
    const sorted = sortGroupsForSwitcher([
      group({ groupDid: "1", handle: "zeta.example", role: "member" }),
      group({ groupDid: "2", handle: "pending.example", role: "owner", accepted: false }),
      group({ groupDid: "3", handle: "beta.example", role: "admin" }),
      group({ groupDid: "4", handle: "alpha.example", displayName: "Alpha", role: "member" }),
      group({ groupDid: "5", handle: "own.example", role: "owner" }),
    ])
    expect(sorted.map((g) => g.groupDid)).toEqual(["5", "3", "4", "1", "2"])
  })

  it("does not mutate its input", () => {
    const input = [group({ groupDid: "b", handle: "b" }), group({ groupDid: "a", handle: "a" })]
    sortGroupsForSwitcher(input)
    expect(input.map((g) => g.groupDid)).toEqual(["b", "a"])
  })
})
