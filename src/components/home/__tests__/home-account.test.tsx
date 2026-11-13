import { describe, it, expect } from "vitest"

import { bioFirstLine } from "../home-account-card"
import { groupRowLabel } from "../home-sections"

describe("groupRowLabel", () => {
  const did = "did:plc:group1"

  it("uses the display name, with the @handle under it", () => {
    expect(
      groupRowLabel({ groupDid: did, handle: "estuary.certified.app", displayName: "Estuary Alliance" }),
    ).toEqual({ name: "Estuary Alliance", handle: "@estuary.certified.app" })
  })

  it("falls back to the @handle when the display name is missing or blank", () => {
    expect(groupRowLabel({ groupDid: did, handle: "estuary.certified.app" })).toEqual({
      name: "@estuary.certified.app",
      handle: null,
    })
    expect(
      groupRowLabel({ groupDid: did, handle: "estuary.certified.app", displayName: "   " }),
    ).toEqual({ name: "@estuary.certified.app", handle: null })
  })

  it('says "Group" when the handle never resolved (it is the DID)', () => {
    expect(groupRowLabel({ groupDid: did, handle: did })).toEqual({ name: "Group", handle: null })
    expect(groupRowLabel({ groupDid: did, handle: "", displayName: "" })).toEqual({
      name: "Group",
      handle: null,
    })
  })

  it("keeps the display name but drops a DID-shaped handle line", () => {
    expect(groupRowLabel({ groupDid: did, handle: did, displayName: "Watershed Guild" })).toEqual({
      name: "Watershed Guild",
      handle: null,
    })
  })
})

describe("bioFirstLine", () => {
  it("returns the first non-empty line, trimmed", () => {
    expect(bioFirstLine("\n  Restoration ecologist.  \nSecond line")).toBe("Restoration ecologist.")
  })

  it("returns null for a missing or blank bio", () => {
    expect(bioFirstLine(undefined)).toBeNull()
    expect(bioFirstLine(" \n \n")).toBeNull()
  })
})
