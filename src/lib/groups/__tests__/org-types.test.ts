import { describe, it, expect } from "vitest"
import { orgTypeLabel } from "../org-types"
import { readableOrgTypeTags } from "@/hooks/use-profile-inline-edit"

/**
 * Organization types are stored as slugs by other clients ("nonprofit",
 * "community-group", the lexicon's own examples) and as preset labels by
 * this app's editor. Either reads as a sentence-case label, never a slug.
 */
describe("orgTypeLabel", () => {
  it("labels slugs", () => {
    expect(orgTypeLabel("nonprofit")).toBe("Nonprofit")
    expect(orgTypeLabel("community-group")).toBe("Community group")
    expect(orgTypeLabel("social_enterprise")).toBe("Social enterprise")
    expect(orgTypeLabel("ngo")).toBe("NGO")
  })

  it("puts the presets in sentence case", () => {
    expect(orgTypeLabel("Community Group")).toBe("Community group")
    expect(orgTypeLabel("Indigenous Group")).toBe("Indigenous group")
  })

  it("keeps the capitals of free text", () => {
    expect(orgTypeLabel("Land trust (UK)")).toBe("Land trust (UK)")
  })
})

describe("readableOrgTypeTags", () => {
  it("reads slugs as labels, presets first in their order, without repeats", () => {
    expect(readableOrgTypeTags(["community-group", "nonprofit", "Nonprofit"])).toEqual([
      "Nonprofit",
      "Community group",
    ])
  })

  it("keeps free text after the presets", () => {
    expect(readableOrgTypeTags(["cooperative", "Business"])).toEqual(["Business", "Cooperative"])
  })
})
