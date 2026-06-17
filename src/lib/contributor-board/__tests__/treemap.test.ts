import { describe, it, expect } from "vitest"
import { layoutTreemap, tileSizing } from "@/lib/contributor-board/treemap"
import type { BoardEntry } from "@/lib/atproto/hyperboard-types"

function entry(key: string, value: number): BoardEntry {
  return {
    key,
    index: 0,
    identity: { identity: key },
    contributorUri: null,
    did: null,
    name: key,
    value,
    imageUrl: null,
    videoUrl: null,
    hoverImageUrl: null,
    hoverIframeUrl: null,
    url: null,
    circular: true,
  }
}

describe("layoutTreemap", () => {
  it("returns one tile per positive-weight entry covering the box", () => {
    const tiles = layoutTreemap(
      [entry("a", 70), entry("b", 20), entry("c", 10)],
      1000,
      1000,
      0,
    )
    expect(tiles).toHaveLength(3)
    const totalArea = tiles.reduce((s, t) => s + t.width * t.height, 0)
    // Squarify fills the whole box (allowing for float rounding).
    expect(totalArea).toBeGreaterThan(1000 * 1000 * 0.99)
  })

  it("sizes tiles proportionally to weight", () => {
    const tiles = layoutTreemap([entry("big", 90), entry("small", 10)], 1000, 1000, 0)
    const big = tiles.find((t) => t.entry.key === "big")!
    const small = tiles.find((t) => t.entry.key === "small")!
    const bigArea = big.width * big.height
    const smallArea = small.width * small.height
    expect(bigArea / smallArea).toBeGreaterThan(6) // ~9:1
  })

  it("drops zero/negative-weight entries", () => {
    const tiles = layoutTreemap([entry("a", 10), entry("z", 0), entry("n", -5)], 500, 500)
    expect(tiles.map((t) => t.entry.key)).toEqual(["a"])
  })

  it("returns nothing for an empty box", () => {
    expect(layoutTreemap([entry("a", 10)], 0, 0)).toEqual([])
    expect(layoutTreemap([], 100, 100)).toEqual([])
  })
})

describe("tileSizing", () => {
  it("scales avatar + font with tile size and hides chrome on tiny tiles", () => {
    const big = tileSizing(400, 300)
    expect(big.showAvatar).toBe(true)
    expect(big.showLabel).toBe(true)
    const tiny = tileSizing(20, 20)
    expect(tiny.showAvatar).toBe(false)
    expect(tiny.showLabel).toBe(false)
  })
})
