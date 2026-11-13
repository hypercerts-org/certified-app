import { describe, it, expect } from "vitest"
import { dominantColours, isPrivateAddress, looksLikeBotCheck } from "../../../../scripts/site-capture/capture.mjs"

describe("site capture: which addresses a page may reach", () => {
  it.each([
    ["8.8.8.8", false],
    ["2606:4700::1111", false],
    ["::ffff:8.8.8.8", false],
    ["10.1.2.3", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true],
    ["172.20.0.1", true],
    ["192.168.1.1", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["::1", true],
    ["::", true],
    ["::ffff:127.0.0.1", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["2002::1", true],
    ["2001:db8::1", true],
    ["64:ff9b::1.2.3.4", true],
    ["not an address", true],
  ])("%s is private: %s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected)
  })
})

describe("site capture: the colours covering the screens", () => {
  const pixels = (...runs: [number, [number, number, number, number]][]) =>
    runs.flatMap(([n, rgba]) => Array.from({ length: n }, () => rgba).flat())

  it("ranks colours by area and counts near shades as one", () => {
    const colours = dominantColours(
      pixels([1000, [255, 255, 255, 255]], [300, [255, 90, 0, 255]], [300, [250, 95, 5, 255]], [2, [1, 2, 3, 255]]),
    )
    expect(colours.map((c) => c.hex)).toEqual(["#FFFFFF", "#FD5D03"])
    expect(colours[0].share).toBeCloseTo(0.624, 2)
  })

  it("skips transparent pixels and stops at the maximum", () => {
    expect(dominantColours(pixels([50, [255, 0, 0, 0]]))).toEqual([])
    const many = pixels(...Array.from({ length: 20 }, (_, i) => [10, [i * 12, 255 - i * 12, (i * 50) % 255, 255]] as [number, [number, number, number, number]]))
    expect(dominantColours(many, 5)).toHaveLength(5)
  })
})

describe("site capture: bot checks", () => {
  it("knows a bot check from the site", () => {
    expect(looksLikeBotCheck("", "www.givewell.org - Additional security check is required")).toBe(true)
    expect(looksLikeBotCheck("Just a moment...", "")).toBe(true)
    expect(looksLikeBotCheck("Attention Required! | Cloudflare", "")).toBe(true)
    expect(looksLikeBotCheck("Women Win", "We believe in a future where every girl and woman exercises their rights")).toBe(false)
  })
})
