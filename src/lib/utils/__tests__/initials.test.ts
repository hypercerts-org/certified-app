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

  it("falls back to the DID slice when displayName is missing", () => {
    expect(getInitials(null, "did:plc:abcd1234")).toBe("pl")
    expect(getInitials(undefined, "did:web:example.com")).toBe("we")
  })

  it("falls back to the DID slice when displayName is whitespace-only", () => {
    expect(getInitials("   ", "did:plc:abcd1234")).toBe("pl")
  })

  it("returns '?' when both displayName and DID are missing", () => {
    expect(getInitials()).toBe("?")
    expect(getInitials(null, null)).toBe("?")
    expect(getInitials("", "")).toBe("?")
  })

  it("returns '?' when DID is too short to slice", () => {
    expect(getInitials(undefined, "did")).toBe("?")
  })
})
