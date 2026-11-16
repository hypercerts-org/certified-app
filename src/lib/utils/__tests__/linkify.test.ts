import { describe, it, expect } from "vitest"
import { linkFacetRanges, linkify, shortLinkText } from "../linkify"

describe("linkify", () => {
  it("finds http(s) and www addresses, leaving sentence punctuation out", () => {
    expect(linkify("See https://example.org/a. Or www.reef.org, thanks!")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "https://example.org/a", href: "https://example.org/a" },
      { kind: "text", text: ". Or " },
      { kind: "link", text: "www.reef.org", href: "https://www.reef.org/" },
      { kind: "text", text: ", thanks!" },
    ])
  })

  it("keeps brackets the address opened and drops the ones it didn't", () => {
    expect(linkify("(see https://en.wikipedia.org/wiki/Mangrove_(tree))")[1]).toMatchObject({
      text: "https://en.wikipedia.org/wiki/Mangrove_(tree)",
    })
    expect(linkify("(https://x.org/a)")[1]).toMatchObject({ text: "https://x.org/a" })
  })

  it("never links anything but http(s)", () => {
    expect(linkify("javascript:alert(1) and ftp://x.org")).toEqual([
      { kind: "text", text: "javascript:alert(1) and ftp://x.org" },
    ])
    expect(linkify("just www. here")).toEqual([{ kind: "text", text: "just www. here" }])
  })
})

describe("shortLinkText", () => {
  it("drops the scheme and www, and cuts long addresses", () => {
    expect(shortLinkText("https://www.example.org/a")).toBe("example.org/a")
    const long = shortLinkText(`https://example.org/${"x".repeat(80)}`)
    expect(long).toHaveLength(48)
    expect(long.endsWith("…")).toBe(true)
  })
})

describe("linkFacetRanges", () => {
  it("counts UTF-8 bytes, as AT Protocol facets do", () => {
    // "é" is two bytes, so the link starts at byte 7, not 6.
    expect(linkFacetRanges("Café: https://x.org")).toEqual([
      { byteStart: 7, byteEnd: 20, uri: "https://x.org/" },
    ])
  })
})
