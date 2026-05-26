import { describe, it, expect } from "vitest"
import { computeHomeFeedAuthors } from "../use-home-feed-authors"
import { MAX_AUTHORS_FILTER_SIZE } from "@/lib/atproto/follower-events"

describe("computeHomeFeedAuthors", () => {
  it("returns empty + not-oversized when did is null", () => {
    const result = computeHomeFeedAuthors(
      null,
      new Set(["did:plc:a"]),
      new Set(["did:plc:b"]),
    )
    expect(result.authors).toEqual([])
    expect(result.isOversized).toBe(false)
  })

  it("returns empty when both sets are empty", () => {
    const result = computeHomeFeedAuthors(
      "did:plc:viewer",
      new Set(),
      new Set(),
    )
    expect(result.authors).toEqual([])
    expect(result.isOversized).toBe(false)
  })

  it("unions two disjoint sets", () => {
    const result = computeHomeFeedAuthors(
      "did:plc:viewer",
      new Set(["did:plc:a", "did:plc:c"]),
      new Set(["did:plc:b"]),
    )
    expect(result.authors).toEqual(["did:plc:a", "did:plc:b", "did:plc:c"])
    expect(result.isOversized).toBe(false)
  })

  it("dedupes overlap between Bluesky and Certified", () => {
    const result = computeHomeFeedAuthors(
      "did:plc:viewer",
      new Set(["did:plc:a", "did:plc:b"]),
      new Set(["did:plc:b", "did:plc:c"]),
    )
    expect(result.authors).toEqual(["did:plc:a", "did:plc:b", "did:plc:c"])
  })

  it("returns alphabetically-sorted authors", () => {
    const result = computeHomeFeedAuthors(
      "did:plc:viewer",
      new Set(["did:plc:zeta", "did:plc:alpha", "did:plc:mu"]),
      new Set(),
    )
    expect(result.authors).toEqual([
      "did:plc:alpha",
      "did:plc:mu",
      "did:plc:zeta",
    ])
  })

  it("truncates to MAX_AUTHORS_FILTER_SIZE and marks isOversized", () => {
    const oversized = new Set<string>()
    for (let i = 0; i < MAX_AUTHORS_FILTER_SIZE + 50; i++) {
      // Pad with leading zeros so alphabetical sort matches numeric order.
      oversized.add(`did:plc:${String(i).padStart(6, "0")}`)
    }
    const result = computeHomeFeedAuthors(
      "did:plc:viewer",
      oversized,
      new Set(),
    )
    expect(result.authors).toHaveLength(MAX_AUTHORS_FILTER_SIZE)
    expect(result.isOversized).toBe(true)
    // First 500 alphabetically — i.e. the lowest-numbered DIDs.
    expect(result.authors[0]).toBe("did:plc:000000")
    expect(result.authors[MAX_AUTHORS_FILTER_SIZE - 1]).toBe(
      `did:plc:${String(MAX_AUTHORS_FILTER_SIZE - 1).padStart(6, "0")}`,
    )
  })

  it("counts the deduped union, not the raw sum, against the cap", () => {
    // 300 in each, with 50 overlap → union of 550. Without dedupe-first
    // sizing, we would slice before unioning and miss this case.
    const a = new Set<string>()
    const b = new Set<string>()
    for (let i = 0; i < 300; i++) a.add(`did:plc:a${String(i).padStart(4, "0")}`)
    for (let i = 250; i < 550; i++) b.add(`did:plc:a${String(i).padStart(4, "0")}`)
    // union size = 550; isOversized expected.
    const result = computeHomeFeedAuthors("did:plc:viewer", a, b)
    expect(result.authors).toHaveLength(MAX_AUTHORS_FILTER_SIZE)
    expect(result.isOversized).toBe(true)
  })
})
