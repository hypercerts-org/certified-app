import { describe, it, expect } from "vitest"
import {
  contributorKey,
  contributionRoleText,
  buildWeightPercents,
} from "../contributor-display"
import type { ActivityContributor } from "@/lib/atproto/activity-types"

function contributor(
  identity: unknown,
  weight?: string,
): ActivityContributor {
  return {
    contributorIdentity: identity,
    ...(weight !== undefined ? { contributionWeight: weight } : {}),
  } as ActivityContributor
}

describe("contributorKey", () => {
  it("uses the strong-ref uri when present", () => {
    expect(
      contributorKey(contributor({ uri: "at://did:plc:a/x/y" }), 0),
    ).toBe("at://did:plc:a/x/y#0")
  })

  it("uses the inline identity when present", () => {
    expect(contributorKey(contributor({ identity: "alice.bsky" }), 1)).toBe(
      "alice.bsky#1",
    )
  })

  it("uses a bare-string identity", () => {
    expect(contributorKey(contributor("bob.bsky"), 2)).toBe("bob.bsky#2")
  })

  it("falls back to the position for null / unrecognised shapes", () => {
    expect(contributorKey(contributor(null), 3)).toBe("contributor-3")
    expect(contributorKey(contributor({ other: true }), 4)).toBe(
      "contributor-4",
    )
  })
})

describe("contributionRoleText", () => {
  it("returns a bare string as-is", () => {
    expect(contributionRoleText("Maintainer")).toBe("Maintainer")
  })

  it("extracts role from an object", () => {
    expect(contributionRoleText({ role: "Reviewer" })).toBe("Reviewer")
  })

  it("returns null for objects without a string role", () => {
    expect(contributionRoleText({ role: 1 })).toBeNull()
    expect(contributionRoleText({ uri: "at://x" })).toBeNull()
  })

  it("does not throw on primitives (the `in` operator would)", () => {
    expect(contributionRoleText(42)).toBeNull()
    expect(contributionRoleText(null)).toBeNull()
    expect(contributionRoleText(undefined)).toBeNull()
  })
})

describe("buildWeightPercents", () => {
  it("normalises parseable weights to percentages of the total", () => {
    const out = buildWeightPercents([
      contributor("a", "1"),
      contributor("b", "1"),
      contributor("c", "2"),
    ])
    expect(out.get(0)).toBe("25")
    expect(out.get(1)).toBe("25")
    expect(out.get(2)).toBe("50")
  })

  it("skips non-numeric and negative weights but keeps the rest", () => {
    const out = buildWeightPercents([
      contributor("a", "high"),
      contributor("b", "1"),
      contributor("c", "-2"),
    ])
    expect(out.has(0)).toBe(false)
    expect(out.get(1)).toBe("100")
    expect(out.has(2)).toBe(false)
  })

  it("returns an empty map when nothing parses or the total is zero", () => {
    expect(
      buildWeightPercents([contributor("a", "high"), contributor("b")]).size,
    ).toBe(0)
    expect(buildWeightPercents([contributor("a", "0")]).size).toBe(0)
    expect(buildWeightPercents([]).size).toBe(0)
  })
})
