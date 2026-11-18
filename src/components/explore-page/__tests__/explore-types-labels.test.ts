import { describe, it, expect } from "vitest"
import { filtersForKind } from "../explore-types"

// C9: in navigation and menus the account kind is a group, never an
// "organization" (DESIGN.md §4.4).
describe("Explore account filters", () => {
  it("call the viewer's groups My groups", () => {
    const labels = filtersForKind("accounts").map((f) => f.label)
    expect(labels).toContain("My groups")
    expect(labels.some((l) => /organi[sz]ation/i.test(l))).toBe(false)
  })
})
