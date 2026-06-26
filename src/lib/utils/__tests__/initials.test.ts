import { describe, it, expect } from "vitest"
import { getInitials } from "../initials"

describe("getInitials", () => {
  it("returns first letter of first two words for multi-word names", () => {
    expect(getInitials("Alice Cooper")).toBe("AC")
    expect(getInitials("Jane Mary Doe")).toBe("JM")
  })

  it("returns first two characters of single-word names", () => {
    expect(getInitials("alice")).toBe("al")
    expect(getInitials("Bob")).toBe("Bo")
  })

  it("returns the only character when single-word is one character", () => {
    expect(getInitials("a")).toBe("a")
  })

  it("trims surrounding whitespace before splitting", () => {
    expect(getInitials("  Alice Cooper  ")).toBe("AC")
    expect(getInitials("\tCharlie")).toBe("Ch")
  })

  it("collapses repeated internal whitespace", () => {
    expect(getInitials("Alice    Cooper")).toBe("AC")
  })

  it("falls back to the handle's first two characters when displayName is missing", () => {
    expect(getInitials(null, "alice.bsky.social")).toBe("al")
    expect(getInitials(undefined, "@bob.certified.one")).toBe("bo")
    expect(getInitials("   ", "carol.example.com")).toBe("ca")
  })

  it("never derives initials from a DID (would give a misleading 'pl' from did:plc)", () => {
    expect(getInitials(null, "did:plc:abcd1234")).toBe("?")
    expect(getInitials(undefined, "did:web:example.com")).toBe("?")
    expect(getInitials("   ", "did:plc:abcd1234")).toBe("?")
  })

  it("returns '?' when both displayName and handle are missing", () => {
    expect(getInitials()).toBe("?")
    expect(getInitials(null, null)).toBe("?")
    expect(getInitials("", "")).toBe("?")
  })
})
