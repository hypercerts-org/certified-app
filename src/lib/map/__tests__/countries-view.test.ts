import { describe, expect, it } from "vitest"
import { countryByName, countryFeatures } from "@/lib/map/countries"
import {
  NO_COUNTRY,
  STEPS,
  STEP_PAINT,
  buildCountryRows,
  countryFitBounds,
  countryLabel,
  ordinal,
  rankRows,
  regionOf,
  stepOf,
} from "@/lib/map/countries-view"
import type { Account, MapModel, Place } from "@/lib/map/model"

const account: Account = { i: 0, did: "did:plc:a", name: "A", avatar: null, href: "/a" }

function place(i: number, country: string | null, prec: Place["prec"] = "site"): Place {
  return {
    i,
    lng: 0,
    lat: 0,
    prec,
    name: null,
    account,
    country,
    countryFeature: country ? countryByName(country) : -1,
    area: null,
    km2: null,
    radiusKm: null,
  }
}

function model(): MapModel {
  const kenya = place(0, "Kenya")
  const kenyaOnly = place(1, "Kenya", "country")
  const sea = place(2, null)
  const peru = place(3, "Peru")
  const project = { kind: "project" as const, i: 0, title: "P", account, place: kenya, activities: [], href: "/p" }
  const activities = [
    // Placed by its project.
    { kind: "activity" as const, i: 0, title: "a0", account, place: kenya, via: "project" as const, project, more: [], date: null, href: "/a0" },
    { kind: "activity" as const, i: 1, title: "a1", account, place: kenyaOnly, via: null, project: null, more: [], date: null, href: "/a1" },
    { kind: "activity" as const, i: 2, title: "a2", account, place: sea, via: null, project: null, more: [], date: null, href: "/a2" },
    // No place at all: not counted anywhere.
    { kind: "activity" as const, i: 3, title: "a3", account, place: null, via: null, project: null, more: [], date: null, href: "/a3" },
  ]
  const orgs = [{ kind: "org" as const, i: 0, account, place: peru, href: "/o" }]
  return {
    accounts: [account],
    places: [kenya, kenyaOnly, sea, peru],
    activities,
    projects: [project],
    orgs,
    unused: [],
    totals: {} as MapModel["totals"],
    partial: false,
    generatedAt: "",
  }
}

describe("buildCountryRows", () => {
  it("counts each record in its place's country, country-only places in full", () => {
    const { rows, none, byKey } = buildCountryRows(model())
    const kenya = byKey.get("Kenya")!
    expect(kenya.n).toEqual({ activity: 2, project: 1, org: 0 })
    expect(kenya.countryOnly).toEqual({ activity: 1, project: 0, org: 0 })
    expect(kenya.region).toBe("Africa")
    expect(byKey.get("Peru")!.n.org).toBe(1)
    expect(none.key).toBe(NO_COUNTRY)
    expect(none.n.activity).toBe(1)
    expect(rows.map((r) => r.key).sort()).toEqual(["Kenya", "Peru"])
  })

  it("ranks by the counted kind, then by everything", () => {
    const { rows } = buildCountryRows(model())
    expect(rankRows(rows, "activity").map((r) => r.key)).toEqual(["Kenya", "Peru"])
    expect(rankRows(rows, "org").map((r) => r.key)).toEqual(["Peru", "Kenya"])
  })
})

describe("steps", () => {
  it("puts each count in a step, and none in none", () => {
    expect(stepOf(0)).toBe(-1)
    expect(stepOf(1)).toBe(0)
    expect(stepOf(4)).toBe(1)
    expect(stepOf(5)).toBe(2)
    expect(stepOf(39)).toBe(3)
    expect(stepOf(400)).toBe(4)
    expect(STEP_PAINT).toHaveLength(STEPS.length)
  })
})

describe("regions and names", () => {
  it("knows the region of every country but Antarctica", () => {
    const missing = countryFeatures()
      .map((f) => f.properties.name)
      .filter((n) => !regionOf(n))
    expect(missing).toEqual(["Antarctica"])
  })

  it("writes out Natural Earth's short forms", () => {
    expect(countryLabel("United States of America")).toBe("United States")
    expect(countryLabel("Dem. Rep. Congo")).toBe("DR Congo")
    expect(countryLabel("Kenya")).toBe("Kenya")
  })

  it("fits a country to its main landmass", () => {
    const [[w, , ], [e]] = countryFitBounds(countryByName("United States of America"))!
    // The lower 48, not Alaska.
    expect(w).toBeGreaterThan(-130)
    expect(e).toBeLessThan(-60)
    const [[fw], [fe]] = countryFitBounds(countryByName("France"))!
    // Not French Guiana.
    expect(fw).toBeGreaterThan(-10)
    expect(fe).toBeLessThan(15)
  })

  it("says ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "103rd",
    ])
  })
})
