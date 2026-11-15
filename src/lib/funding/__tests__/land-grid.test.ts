import { describe, it, expect } from "vitest"
import { coarseLand, landFor, loadFineLand, type LandGrid } from "../land-grid"

const isLand = (g: LandGrid, lat: number, lng: number) => {
  const row = Math.round((g.lat0 - lat) / g.step)
  const col = Math.round((lng - g.lon0) / g.step)
  return g.bits[row * g.cols + col] === 1
}

describe("land grid", () => {
  it("starts from the coarse grid", () => {
    expect(landFor(10, 4.4)).toBe(coarseLand())
  })

  it("loads the fine grid and picks a finer spacing as the map zooms in", async () => {
    expect(await loadFineLand()).toBe(true)
    // About 3.1px a degree (the whole world on a 1,118px map) keeps 1.5°;
    // twelve times closer gets the 0.25° grid itself.
    expect(landFor(3.1, 4.4).step).toBe(1.5)
    expect(landFor(6.2, 4.4).step).toBe(0.75)
    expect(landFor(9.3, 4.4).step).toBe(0.5)
    expect(landFor(37, 4.4).step).toBe(0.25)
  })

  it("draws New Zealand's two islands, with sea either side", async () => {
    await loadFineLand()
    const fine = landFor(100, 4.4)
    expect(isLand(fine, -38.7, 176.1)).toBe(true) // Lake Taupō's shore, North Island
    expect(isLand(fine, -43.5, 171.0)).toBe(true) // Canterbury, South Island
    expect(isLand(fine, -40.0, 179.0)).toBe(false) // The Pacific, east of the North Island
    expect(isLand(fine, -40.0, 170.0)).toBe(false) // Tasman Sea
  })
})
