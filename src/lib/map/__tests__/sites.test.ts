import { describe, expect, it } from "vitest"
import type { MapDataset, MapPolygon } from "@/lib/map/dataset-types"
import { buildModel } from "@/lib/map/model"
import { buildSites, inPitches, looksLikeTest, siteName, tileShape } from "@/lib/map/sites"

/** A small square around (lng, lat), `d` degrees across, wound for d3-geo. */
const square = (lng: number, lat: number, d: number): MapPolygon[] => [
  [
    [
      [lng, lat],
      [lng, lat + d],
      [lng + d, lat + d],
      [lng + d, lat],
      [lng, lat],
    ],
  ],
]

const plot = square(36, -1, 0.001)
const big = square(30, -5, 2)

/** Two copies of one plot (one used by an activity, one saved by another
 *  account), a plot a project uses, a region, a test shape, and a plot that
 *  an activity names only among its further places. */
const ds: MapDataset = {
  generatedAt: "2026-11-15T00:00:00.000Z",
  partial: false,
  accounts: [{ did: "did:plc:aaa", name: "Green Belt" }, { did: "did:plc:bbb", name: "Copier" }],
  countries: ["Kenya"],
  places: [
    { lng: 36, lat: -1, prec: "area", name: "Plot A", account: 0, country: 0, area: 0, km2: 0.0123 }, // 0 used by activity
    { lng: 36, lat: -1, prec: "area", name: "QmQQGDZuuKpgAaa2eMUuS1fsjhCunnXroTAawFCpje7bqo", account: 1, country: 0, area: 1, km2: 0.0123 }, // 1 copy, unused
    { lng: 37, lat: -2, prec: "area", name: "Farm.geojson", account: 0, country: 0, area: 2, km2: 0.0123 }, // 2 project
    { lng: 30, lat: -5, prec: "area", name: "Rangeland", account: 0, country: 0, area: 3, km2: 49_000 }, // 3 region, unused
    { lng: 38, lat: -3, prec: "area", name: "Test site", account: 1, country: 0, area: 4, km2: 0.0123 }, // 4 test, unused
    { lng: 39, lat: -4, prec: "area", name: "Far plot", account: 0, country: 0, area: 5, km2: 0.0123 }, // 5 named in `more`
  ],
  areas: [plot, plot, square(37, -2, 0.001), big, square(38, -3, 0.001), square(39, -4, 0.001)],
  activities: [
    { rkey: "a1", title: "Planting", account: 0, place: 0, more: [5], project: -1, date: "2026-03-01" },
    { rkey: "a2", title: "Weeding", account: 0, place: -1, more: [], project: 0, date: null },
  ],
  projects: [{ rkey: "p1", title: "Farm project", account: 0, place: 2 }],
  orgs: [],
  unused: [1, 3, 4],
  totals: { activities: 2, projects: 1, orgs: 0, unplaceable: 0 },
}

describe("buildSites", () => {
  const model = buildModel(ds)
  const sites = buildSites(model)
  const byName = (n: string) => sites.find((s) => s.name === n)!

  it("stacks identical outlines into one site, the used copy first", () => {
    expect(sites).toHaveLength(5)
    const a = byName("Plot A")
    expect(a.places.map((p) => p.i)).toEqual([0, 1])
    expect(a.savedBy.map((x) => x.name)).toEqual(["Green Belt", "Copier"])
    expect(a.used).toBe(true)
    expect(a.kind).toBe("activity")
  })

  it("finds what uses each site", () => {
    expect(byName("Plot A").uses).toMatchObject([{ kind: "activity", how: "own" }])
    const farm = byName("Farm")
    expect(farm.kind).toBe("activity")
    expect(farm.uses).toHaveLength(1)
    const u = farm.uses[0]
    expect(u.kind === "project" && u.activities.map((a) => a.title)).toEqual(["Weeding"])
    expect(farm.counts).toMatchObject({ project: 1, activity: 1 })
    expect(byName("Far plot").uses).toMatchObject([{ kind: "activity", how: "more" }])
  })

  it("hides regions and test shapes", () => {
    expect(byName("Rangeland")).toMatchObject({ region: true, hidden: true, used: false, kind: "unused" })
    expect(byName("Test site")).toMatchObject({ test: true, hidden: true })
    expect(byName("Plot A").hidden).toBe(false)
  })

  it("measures small plots from the outline", () => {
    // 0.001° square near the equator: about 0.0123 km².
    expect(byName("Plot A").km2).toBeGreaterThan(0.01)
    expect(byName("Plot A").km2).toBeLessThan(0.015)
  })
})

describe("names", () => {
  it("drops content ids and file extensions", () => {
    expect(siteName("QmQQGDZuuKpgAaa2eMUuS1fsjhCunnXroTAawFCpje7bqo")).toBeNull()
    expect(siteName("ALC.geojson")).toBe("ALC")
    expect(siteName("  Mida Creek ")).toBe("Mida Creek")
    expect(siteName("Unrestored site ,  Juabari.")).toBe("Unrestored site, Juabari.")
  })

  it("spots test names", () => {
    for (const n of ["Test", "test site", "Pi-Eval Test Site", "Cagwait_Test", "Fake SIte", "Hello", "ddddd", "1", "La cotinga testing site"]) {
      expect(looksLikeTest(n)).toBe(true)
    }
    for (const n of ["Testimony Farm", "Contest Hill", "Kilifi", null]) expect(looksLikeTest(n)).toBe(false)
  })
})

describe("tileShape", () => {
  it("draws the outline with a round scale bar under 40% of the tile", () => {
    const t = tileShape({ type: "MultiPolygon", coordinates: plot })
    expect(t.d.startsWith("M")).toBe(true)
    // About 111 m across in about 82 of 120 units: a 50 m bar.
    expect(t.barLabel).toBe("50 m")
    expect(t.barPct).toBeGreaterThan(20)
    expect(t.barPct).toBeLessThanOrEqual(40)
    expect(tileShape({ type: "MultiPolygon", coordinates: big }).barLabel).toBe("100 km")
    expect(t.dots).toEqual([])
  })

  it("marks plots too small to see when the parts lie far apart", () => {
    const spread = { type: "MultiPolygon" as const, coordinates: [...square(36, -1, 0.0005), ...square(36.2, -1.1, 0.0005)] }
    expect(tileShape(spread).dots).toHaveLength(2)
  })
})

describe("inPitches", () => {
  it("compares with football pitches", () => {
    expect(inPitches(0.002)).toBe("smaller than a football pitch")
    expect(inPitches(0.0714)).toBe("about 10 football pitches")
    expect(inPitches(5000)).toBeNull()
  })
})
