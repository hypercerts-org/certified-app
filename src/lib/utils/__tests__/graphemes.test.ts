import { describe, it, expect } from "vitest"
import { countGraphemes } from "../graphemes"

describe("countGraphemes", () => {
  it("counts plain ASCII characters one-for-one", () => {
    expect(countGraphemes("")).toBe(0)
    expect(countGraphemes("hello")).toBe(5)
  })

  it("counts a multi-code-unit emoji as a single grapheme", () => {
    // U+1F600 is two UTF-16 code units but one visible character.
    expect(countGraphemes("\u{1F600}")).toBe(1)
    expect("\u{1F600}".length).toBe(2)
  })

  it("counts a ZWJ emoji sequence as a single grapheme", () => {
    // Family emoji: multiple code points joined by ZWJ → one cluster.
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}"
    expect(countGraphemes(family)).toBe(1)
  })

  it("counts combining-mark sequences as a single grapheme", () => {
    // "e" + combining acute accent → one visible character.
    expect(countGraphemes("é")).toBe(1)
  })

  it("counts mixed content correctly", () => {
    // "a" + emoji + "b" → 3 visible characters.
    expect(countGraphemes("a\u{1F600}b")).toBe(3)
  })
})
