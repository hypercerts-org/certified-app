import { describe, it, expect } from "vitest"

// quality-046: `sortLists` used two-way ternary comparators
// (`a.createdAt > b.createdAt ? -1 : 1`) for the created-desc /
// created-asc keys, which return 1 (or -1) even when the two
// timestamps are EQUAL. A comparator that never returns 0 makes the
// sort unstable: same-second items can shuffle their relative order
// between renders. The fix routes both createdAt keys through a
// three-way `compareString` that returns 0 on equality, so equal
// timestamps preserve their incoming order (stable sort).

import { sortLists } from "../endorsement-lists"
import type { EndorsementList } from "@/hooks/use-endorsement-lists"

function makeList(rkey: string, createdAt: string, title = rkey): EndorsementList {
  return {
    uri: `at://did:plc:test/org.hypercerts.collection/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    title,
    createdAt,
    items: [],
  }
}

describe("sortLists — stable order for equal createdAt", () => {
  const SAME = "2026-05-01T12:00:00.000Z"

  it("preserves input order of equal-timestamp items (created-desc)", () => {
    const input = [
      makeList("a", SAME),
      makeList("b", SAME),
      makeList("c", SAME),
    ]
    const out = sortLists(input, "created-desc").map((l) => l.rkey)
    expect(out).toEqual(["a", "b", "c"])
  })

  it("preserves input order of equal-timestamp items (created-asc)", () => {
    const input = [
      makeList("a", SAME),
      makeList("b", SAME),
      makeList("c", SAME),
    ]
    const out = sortLists(input, "created-asc").map((l) => l.rkey)
    expect(out).toEqual(["a", "b", "c"])
  })

  it("still orders distinct timestamps newest-first for created-desc", () => {
    const input = [
      makeList("older", "2026-01-01T00:00:00.000Z"),
      makeList("newer", "2026-05-01T00:00:00.000Z"),
    ]
    const out = sortLists(input, "created-desc").map((l) => l.rkey)
    expect(out).toEqual(["newer", "older"])
  })

  it("still orders distinct timestamps oldest-first for created-asc", () => {
    const input = [
      makeList("newer", "2026-05-01T00:00:00.000Z"),
      makeList("older", "2026-01-01T00:00:00.000Z"),
    ]
    const out = sortLists(input, "created-asc").map((l) => l.rkey)
    expect(out).toEqual(["older", "newer"])
  })
})
