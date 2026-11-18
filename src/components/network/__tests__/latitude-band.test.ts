import { describe, it, expect } from "vitest"
import { latitudeBand } from "../map/world-map"

// A phone's flat map starts on the band of latitudes the places are in, not
// the whole height of the world (mostly Arctic in Mercator).

describe("latitudeBand", () => {
  it("spans most of the places, with a margin, leaving out a stray one", () => {
    const lats = [...Array.from({ length: 98 }, (_, i) => -30 + (i * 80) / 97), 82]
    const band = latitudeBand(lats)!
    expect(band[0]).toBeLessThan(-30)
    expect(band[0]).toBeGreaterThanOrEqual(-40)
    // The one place at 82°N doesn't pull the band to the pole.
    expect(band[1]).toBeLessThan(70)
    expect(band[1]).toBeGreaterThan(50)
  })

  it("stays within the map's own limits", () => {
    const band = latitudeBand(Array.from({ length: 20 }, (_, i) => (i % 2 ? 84 : -60)))!
    expect(band[0]).toBeGreaterThanOrEqual(-60)
    expect(band[1]).toBeLessThanOrEqual(84)
  })

  it("has no band with too few places to tell", () => {
    expect(latitudeBand([10, 20])).toBeNull()
    expect(latitudeBand([])).toBeNull()
  })
})
