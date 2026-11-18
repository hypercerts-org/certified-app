import { describe, expect, it } from "vitest"
import { CONFIRM_ROLES } from "@/lib/atproto/funding-provenance"
import { confirmRoleHint, confirmRoleLabel, orPhrases, recordedByPhrase } from "../labels"

describe("confirmRoleLabel", () => {
  it("names each trusted source, then the other buckets", () => {
    expect(CONFIRM_ROLES.map(confirmRoleLabel)).toEqual([
      "Ma Earth",
      "GainForest",
      "Both sides",
      "Funder only",
      "Recipient only",
      "Other publishers",
    ])
  })
})

describe("confirmRoleHint", () => {
  it("says which source recorded the receipt", () => {
    expect(confirmRoleHint("gainforest")).toBe(
      "Recorded by GainForest, the platform that processed the payment.",
    )
    expect(confirmRoleHint("ma-earth")).toMatch(/^Recorded by Ma Earth,/)
  })

  it("says other publishers are none of the sources", () => {
    expect(confirmRoleHint("other")).toBe(
      "Published by someone other than the funder, the recipient, Ma Earth or GainForest.",
    )
  })

  it("never calls the sources a generic group", () => {
    for (const role of CONFIRM_ROLES) {
      expect(confirmRoleLabel(role)).not.toMatch(/trusted sources/i)
      expect(confirmRoleHint(role)).not.toMatch(/trusted (source|platform)/i)
    }
  })
})

describe("recordedByPhrase", () => {
  it("names the sources in a selection", () => {
    expect(recordedByPhrase(["gainforest", "both"])).toBe("recorded by GainForest")
    expect(recordedByPhrase(["ma-earth", "gainforest"])).toBe("recorded by Ma Earth and GainForest")
    expect(recordedByPhrase(["both", "other"])).toBeNull()
  })
})

describe("orPhrases", () => {
  it("joins with 'or', with a comma when a phrase has its own 'and'", () => {
    expect(orPhrases(["a"])).toBe("a")
    expect(orPhrases(["a", "b", "c"])).toBe("a, b or c")
    expect(orPhrases(["recorded by Ma Earth and GainForest", "confirmed by both sides"])).toBe(
      "recorded by Ma Earth and GainForest, or confirmed by both sides",
    )
  })
})
