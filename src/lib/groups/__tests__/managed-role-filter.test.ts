import { describe, it, expect } from "vitest"
import { ownedOrAdminGroups, managedAuthorDids } from "@/lib/groups/managed"
import type { Group, OrgRole } from "@/lib/groups/types"

function group(groupDid: string, role: OrgRole): Group {
  return {
    groupDid,
    handle: `${groupDid}.example.com`,
    role,
    accepted: true,
  }
}

const VIEWER = "did:plc:viewer"

describe("ownedOrAdminGroups", () => {
  it("keeps owner and admin groups, drops member groups", () => {
    const groups: Group[] = [
      group("did:plc:owner", "owner"),
      group("did:plc:admin", "admin"),
      group("did:plc:member", "member"),
    ]
    const kept = ownedOrAdminGroups(groups)
    expect(kept.map((g) => g.groupDid)).toEqual(["did:plc:owner", "did:plc:admin"])
  })

  it("drops a downgraded admin once its role is member", () => {
    // Simulate a group the viewer used to admin but was downgraded to
    // member: the predicate keys off the CURRENT role, so it falls out.
    const before: Group[] = [group("did:plc:x", "admin")]
    expect(ownedOrAdminGroups(before).map((g) => g.groupDid)).toEqual(["did:plc:x"])

    const after: Group[] = [group("did:plc:x", "member")]
    expect(ownedOrAdminGroups(after)).toEqual([])
  })

  it("returns an empty array when there are no owner/admin groups", () => {
    expect(ownedOrAdminGroups([group("did:plc:m", "member")])).toEqual([])
    expect(ownedOrAdminGroups([])).toEqual([])
  })

  it("preserves input order", () => {
    const groups: Group[] = [
      group("did:plc:a", "admin"),
      group("did:plc:m", "member"),
      group("did:plc:o", "owner"),
    ]
    expect(ownedOrAdminGroups(groups).map((g) => g.groupDid)).toEqual([
      "did:plc:a",
      "did:plc:o",
    ])
  })
})

describe("managedAuthorDids — the 'My X' author set", () => {
  const groups: Group[] = [
    group("did:plc:owner", "owner"),
    group("did:plc:admin", "admin"),
    group("did:plc:member", "member"),
  ]

  it("personal context: viewer first, then owner/admin groups (member excluded)", () => {
    expect(managedAuthorDids(null, VIEWER, groups)).toEqual([
      VIEWER,
      "did:plc:owner",
      "did:plc:admin",
    ])
  })

  it("acting-as a group: just that group's records", () => {
    const activeOrg = group("did:plc:owner", "owner")
    expect(managedAuthorDids(activeOrg, VIEWER, groups)).toEqual(["did:plc:owner"])
  })

  it("dedupes the viewer DID if a group DID somehow equals it", () => {
    const self = [group(VIEWER, "owner")]
    expect(managedAuthorDids(null, VIEWER, self)).toEqual([VIEWER])
  })

  it("empty when signed out with no active group", () => {
    expect(managedAuthorDids(null, null, groups)).toEqual([])
  })

  it("a viewer who only belongs to member groups aggregates just themselves", () => {
    expect(managedAuthorDids(null, VIEWER, [group("did:plc:member", "member")])).toEqual([
      VIEWER,
    ])
  })
})
