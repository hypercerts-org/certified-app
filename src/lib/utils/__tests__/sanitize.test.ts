import { describe, it, expect } from "vitest"
import { stripInvisible, sanitizeEmail, sanitizeHandle } from "../sanitize"

// Invisible code points the regex is pinned to strip.
const ZWSP = "​" // zero-width space
const ZWJ = "‍" // zero-width joiner
const BOM = "﻿" // byte-order mark / zero-width no-break space
const SOFT_HYPHEN = "­" // soft hyphen

describe("stripInvisible", () => {
  it("removes ZWSP, ZWJ, BOM and soft-hyphen characters", () => {
    expect(stripInvisible(`he${ZWSP}llo`)).toBe("hello")
    expect(stripInvisible(`he${ZWJ}llo`)).toBe("hello")
    expect(stripInvisible(`${BOM}hello`)).toBe("hello")
    expect(stripInvisible(`he${SOFT_HYPHEN}llo`)).toBe("hello")
  })

  it("removes a mix of invisible characters in one pass", () => {
    expect(stripInvisible(`${BOM}he${ZWSP}ll${ZWJ}o${SOFT_HYPHEN}`)).toBe(
      "hello",
    )
  })

  it("trims surrounding whitespace but preserves internal whitespace", () => {
    expect(stripInvisible("  hello world  ")).toBe("hello world")
  })

  it("passes a clean string through unchanged", () => {
    expect(stripInvisible("hello world")).toBe("hello world")
  })
})

describe("sanitizeEmail", () => {
  it("removes invisible characters", () => {
    expect(sanitizeEmail(`a${ZWSP}b@ex${ZWJ}ample.com`)).toBe("ab@example.com")
    expect(sanitizeEmail(`${BOM}a@b.com`)).toBe("a@b.com")
    expect(sanitizeEmail(`a${SOFT_HYPHEN}@b.com`)).toBe("a@b.com")
  })

  it("strips all whitespace, including internal whitespace", () => {
    expect(sanitizeEmail("  a b @ exa mple.com  ")).toBe("ab@example.com")
    expect(sanitizeEmail("a@b.com\t\n")).toBe("a@b.com")
  })

  it("lowercases the result", () => {
    expect(sanitizeEmail("Alice@Example.COM")).toBe("alice@example.com")
  })

  it("passes a clean email through unchanged", () => {
    expect(sanitizeEmail("alice@example.com")).toBe("alice@example.com")
  })
})

describe("sanitizeHandle", () => {
  it("removes invisible characters", () => {
    expect(sanitizeHandle(`al${ZWSP}ice.bsky.social`)).toBe(
      "alice.bsky.social",
    )
    expect(sanitizeHandle(`${BOM}alice.bsky.social`)).toBe("alice.bsky.social")
    expect(sanitizeHandle(`alice${SOFT_HYPHEN}.bsky.social`)).toBe(
      "alice.bsky.social",
    )
  })

  it("strips all whitespace, including internal whitespace", () => {
    expect(sanitizeHandle("  alice .bsky. social  ")).toBe("alice.bsky.social")
  })

  it("removes a single leading @", () => {
    expect(sanitizeHandle("@alice.bsky.social")).toBe("alice.bsky.social")
  })

  it("strips whitespace before the leading @ then removes the @", () => {
    expect(sanitizeHandle("  @alice.bsky.social")).toBe("alice.bsky.social")
  })

  it("does not lowercase the handle", () => {
    expect(sanitizeHandle("Alice.BSKY.social")).toBe("Alice.BSKY.social")
  })

  it("passes a clean handle through unchanged", () => {
    expect(sanitizeHandle("alice.bsky.social")).toBe("alice.bsky.social")
  })
})
