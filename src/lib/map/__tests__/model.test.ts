import { describe, expect, it } from "vitest"
import type { MapDataset } from "@/lib/map/dataset-types"
import { buildModel, chainOf, groupItems, itemsFor, matchesQuery } from "@/lib/map/model"

/** Two organizations; one project with two activities at the same spot; an
 *  activity that only has its project's place; a country-only project; an
 *  organization based elsewhere; a place nothing uses. */
const ds: MapDataset = {
  generatedAt: "2026-11-15T00:00:00.000Z",
  partial: false,
  accounts: [
    { did: "did:plc:aaa", name: "Green Belt" },
    { did: "did:plc:bbb", avatar: "bafkreiabc" },
  ],
  countries: ["Kenya"],
  places: [
    { lng: 36.0661, lat: -0.3031, prec: "site", name: "Nakuru, Kenya", account: 0, country: 0 }, // 0 project
    { lng: 36.0661, lat: -0.3031, prec: "site", name: "Nakuru, Kenya", account: 0, country: 0 }, // 1 activity
    { lng: 36.0661, lat: -0.3031, prec: "site", name: "Nakuru", account: 0, country: 0 }, // 2 activity
    { lng: 37.9, lat: 0.02, prec: "country", name: "Kenya", account: 1, country: 0 }, // 3 country-only project
    { lng: 36.8219, lat: -1.2921, prec: "site", name: "Nairobi, Kenya", account: 0, country: 0 }, // 4 org base
    { lng: 35, lat: -1, prec: "area", name: "Plot", account: 1, country: 0, area: 0, km2: 0.4 }, // 5 unused
  ],
  areas: [[[[[35, -1], [35.01, -1], [35.01, -0.99], [35, -1]]]]],
  activities: [
    { rkey: "a1", title: "Planting", account: 0, place: 1, more: [], project: 0, date: "2026-03-01" },
    { rkey: "a2", title: "Monitoring", account: 0, place: 2, more: [], project: 0, date: null },
    { rkey: "a3", title: null, account: 0, place: -1, more: [], project: 0, date: null },
  ],
  projects: [
    { rkey: "p1", title: "Mau Restoration", account: 0, place: 0 },
    { rkey: "p2", title: "Somewhere project", account: 1, place: 3 },
  ],
  orgs: [{ account: 0, place: 4 }],
  unused: [5],
  totals: { activities: 5, projects: 2, orgs: 1, unplaceable: 0 },
}

describe("buildModel", () => {
  const m = buildModel(ds)

  it("links activities to projects and borrows the project's place", () => {
    expect(m.projects[0].activities.map((a) => a.title)).toEqual(["Planting", "Monitoring", "Untitled activity"])
    expect(m.activities[2].place?.i).toBe(0)
    expect(m.activities[2].via).toBe("project")
    expect(m.activities[0].via).toBeNull()
  })

  it("builds links and avatars", () => {
    expect(m.activities[0].href).toBe("/did:plc:aaa/activity/a1")
    expect(m.projects[1].href).toBe("/did:plc:bbb/project/p2")
    expect(m.accounts[1].avatar).toContain("cid=bafkreiabc")
    expect(m.accounts[0].avatar).toBeNull()
    expect(m.places[3].countryFeature).toBeGreaterThanOrEqual(0)
  })
})

describe("groupItems", () => {
  const m = buildModel(ds)

  it("puts everything at one point in one spot, and country-only places by country", () => {
    const { spots, countries } = groupItems(itemsFor(m, new Set(["activity", "project"])))
    const nakuru = spots.find((s) => s.items.length === 4)!
    expect(nakuru.counts).toMatchObject({ activity: 3, project: 1 })
    expect(nakuru.name).toBe("Nakuru, Kenya")
    expect(countries).toHaveLength(1)
    expect(countries[0]).toMatchObject({ country: "Kenya", counts: { project: 1 } })
  })

  it("follows the layers", () => {
    const { spots } = groupItems(itemsFor(m, new Set(["org", "unused"])))
    expect(spots.map((s) => s.counts)).toEqual([
      { activity: 0, project: 0, org: 1, unused: 0 },
      { activity: 0, project: 0, org: 0, unused: 1 },
    ])
    expect(spots[1].area).not.toBeNull()
  })
})

describe("chainOf", () => {
  it("nests a spot's activities under their project", () => {
    const m = buildModel(ds)
    const { spots } = groupItems(itemsFor(m, new Set(["activity", "project"])))
    const chain = chainOf(spots.find((s) => s.items.length === 4)!.items)
    expect(chain.projects).toHaveLength(1)
    expect(chain.projects[0].activities).toHaveLength(3)
    expect(chain.loose).toHaveLength(0)
  })
})

describe("matchesQuery", () => {
  it("matches every word across title, publisher and place", () => {
    const m = buildModel(ds)
    expect(matchesQuery(m.activities[0], "planting nakuru")).toBe(true)
    expect(matchesQuery(m.activities[0], "green belt")).toBe(true)
    expect(matchesQuery(m.activities[0], "nairobi")).toBe(false)
    expect(matchesQuery(m.activities[0], "")).toBe(true)
  })
})
