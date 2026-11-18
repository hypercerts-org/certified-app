import { describe, expect, it } from "vitest"
import {
  GAINFOREST_DID,
  MA_EARTH_DID,
  TRUSTED_FUNDING_SOURCES,
  isTrustedFundingSource,
  joinNames,
  trustedFundingSource,
  trustedSourceByKey,
  trustedSourceNames,
} from "../trusted-sources"

describe("trusted funding sources", () => {
  it("are Ma Earth and GainForest, in that order", () => {
    expect(TRUSTED_FUNDING_SOURCES.map((s) => [s.key, s.did, s.name])).toEqual([
      ["ma-earth", MA_EARTH_DID, "Ma Earth"],
      ["gainforest", "did:plc:edod7rboajioq3jbyxsgeicc", "GainForest"],
    ])
    expect(GAINFOREST_DID).toBe("did:plc:edod7rboajioq3jbyxsgeicc")
  })

  it("knows a source by its account or its key", () => {
    expect(isTrustedFundingSource(GAINFOREST_DID)).toBe(true)
    expect(isTrustedFundingSource("did:plc:someone")).toBe(false)
    expect(isTrustedFundingSource(null)).toBe(false)
    expect(trustedFundingSource(GAINFOREST_DID)?.name).toBe("GainForest")
    expect(trustedFundingSource(undefined)).toBeUndefined()
    expect(trustedSourceByKey("ma-earth")?.did).toBe(MA_EARTH_DID)
    expect(trustedSourceByKey("trusted")).toBeUndefined()
  })

  it("names them together, never as a generic group", () => {
    expect(trustedSourceNames()).toBe("Ma Earth and GainForest")
    expect(trustedSourceNames("or")).toBe("Ma Earth or GainForest")
  })

  it("joins names as a list", () => {
    expect(joinNames([])).toBe("")
    expect(joinNames(["Ma Earth"])).toBe("Ma Earth")
    expect(joinNames(["A", "B", "C"], "or")).toBe("A, B or C")
  })
})
