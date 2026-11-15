import { describe, expect, it } from "vitest"
import { circleRadiusKm, cleanPlaceName, readPlace } from "@/lib/map/places"
import { countryAt, countryByName, countryName } from "@/lib/map/countries"

const read = (locationType: string | null, text: string | null, name: string | null = null) =>
  readPlace({ locationType, text, name })

/** A ring of `n` points `km` from a centre, like the circles some apps save. */
function circle(lng: number, lat: number, km: number, n = 32): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI
    ring.push([lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)])
  }
  return ring
}

describe("readPlace", () => {
  it("reads lat,lng and grades it by its decimals", () => {
    expect(read("coordinate-decimal", "-1.2921, 36.8219")).toMatchObject({ ok: true, lat: -1.2921, lng: 36.8219, prec: "site" })
    expect(read("coordinate-decimal", "-1.29,36.82")).toMatchObject({ ok: true, prec: "approx", radiusKm: 1 })
    expect(read("coordinate-decimal", "-1.3,36.8")).toMatchObject({ ok: true, prec: "approx", radiusKm: 10 })
    expect(read("coordinate-decimal", "8,38")).toMatchObject({ ok: true, prec: "country" })
  })

  it("skips what isn't a place", () => {
    expect(read("coordinate-decimal", "0,0")).toEqual({ ok: false, reason: "zero" })
    expect(read("coordinate-decimal", "https://example.com/location.geojson")).toEqual({ ok: false, reason: "link" })
    expect(read("coordinate-decimal", "")).toEqual({ ok: false, reason: "empty" })
    expect(read("geojson", "{not json")).toEqual({ ok: false, reason: "unreadable" })
    expect(read("coordinate-decimal", "%PDF-1.5")).toEqual({ ok: false, reason: "unreadable" })
  })

  it("rejects coordinates on a projected grid", () => {
    const utm = JSON.stringify({
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32737" } },
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[188938, 9797588], [188914, 9797620], [188912, 9797653], [188938, 9797588]]] } }],
    })
    expect(read("geojson", utm)).toEqual({ ok: false, reason: "projected" })
  })

  it("reads GeoJSON points, including inside features", () => {
    expect(read("geojson-point", '{"type":"Point","coordinates":[79.8609924,6.9168837]}')).toMatchObject({ ok: true, lng: 79.8609924, lat: 6.9168837, prec: "site" })
    const fc = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [36.82191, -1.29207] } }] })
    expect(read("geojson", fc)).toMatchObject({ ok: true, prec: "site" })
  })

  it("keeps a drawn boundary as an area with its size", () => {
    // About 1 km by 1 km near the equator, written counter-clockwise (RFC 7946).
    const square = { type: "Polygon", coordinates: [[[36.8, -1.3], [36.809, -1.3], [36.809, -1.291], [36.8, -1.291], [36.8, -1.3]]] }
    const r = read("geojson-polygon", JSON.stringify(square))
    expect(r).toMatchObject({ ok: true, prec: "area" })
    if (!r.ok) throw new Error("expected a place")
    expect(r.km2).toBeGreaterThan(0.9)
    expect(r.km2).toBeLessThan(1.1)
    expect(r.lng).toBeCloseTo(36.8045, 3)
    expect(r.polygons?.[0][0].length).toBeGreaterThanOrEqual(4)
  })

  it("treats a generated circle as an approximate point with its radius", () => {
    const r = read("geojson-polygon", JSON.stringify({ type: "Polygon", coordinates: [circle(36.82, -1.29, 10)] }))
    expect(r).toMatchObject({ ok: true, prec: "approx" })
    if (!r.ok) throw new Error("expected a place")
    expect(r.radiusKm).toBeGreaterThan(9.5)
    expect(r.radiusKm).toBeLessThan(10.5)
    expect(r.polygons).toBeNull()
  })

  it("says country only when the name is a country, however exact the point", () => {
    expect(read("coordinate-decimal", "0.3475964,32.5825197", "Uganda")).toMatchObject({ ok: true, prec: "country" })
    expect(read("coordinate-decimal", "0.3475964,32.5825197", "Kampala, Uganda")).toMatchObject({ ok: true, prec: "site" })
    expect(read("country-code", "KE")).toMatchObject({ ok: true, prec: "country" })
    expect(read("address", "Kenya")).toMatchObject({ ok: true, prec: "country" })
  })
})

describe("cleanPlaceName", () => {
  it("drops a leading Plus Code", () => {
    expect(cleanPlaceName("98W3+WH Xaafuun, Somalia")).toBe("Xaafuun, Somalia")
    expect(cleanPlaceName("Nakuru, Kenya")).toBe("Nakuru, Kenya")
    expect(cleanPlaceName("  ")).toBeNull()
    expect(cleanPlaceName("5.152948604857976, 97.14982301145864")).toBeNull()
    expect(cleanPlaceName("-1.29 36.82")).toBeNull()
  })
})

describe("circleRadiusKm", () => {
  it("is null for shapes that aren't circles", () => {
    expect(circleRadiusKm([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])).toBeNull()
  })
})

describe("countries", () => {
  it("finds a point's country and countries by name", () => {
    expect(countryName(countryAt(36.82, -1.29))).toBe("Kenya")
    expect(countryAt(-30, 0)).toBe(-1)
    expect(countryName(countryByName("USA"))).toBe("United States of America")
    expect(countryName(countryByName("Brasil"))).toBe("Brazil")
    expect(countryByName("Nakuru")).toBe(-1)
  })
})
