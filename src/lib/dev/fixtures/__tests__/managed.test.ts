import { describe, it, expect } from "vitest"
import { MOCK_DID } from "@/lib/dev/fixtures/session"
import {
  MANAGED_GROUPS,
  MANAGED_OWNER_GROUP_DID,
  MANAGED_ADMIN_GROUP_DID,
  MANAGED_MEMBER_GROUP_DID,
  MANAGED_AGGREGATED_DIDS,
  isManagedAuthorsRequest,
  managedGroupsMembershipsResponse,
  managedProjectsConnection,
  managedActivitiesConnection,
  managedGroups,
  managedOrgProfile,
  managedPlcDidDocument,
} from "@/lib/dev/fixtures/managed"

/**
 * The org-identity read-aggregation preview's load-bearing invariant:
 * the viewer aggregates their PERSONAL records plus the records of the
 * groups they OWN or ADMIN — never a group they're only a MEMBER of.
 * These tests pin that exclusion at the fixture level so the preview the
 * surface is verified against can't silently start including the member
 * group's content.
 */
describe("managed fixtures — aggregation excludes the member group", () => {
  it("has exactly one owner, one admin, and one member group", () => {
    const byRole = MANAGED_GROUPS.map((g) => g.role).sort()
    expect(byRole).toEqual(["admin", "member", "owner"])
  })

  it("MANAGED_AGGREGATED_DIDS = viewer + owner + admin (member excluded)", () => {
    expect(MANAGED_AGGREGATED_DIDS).toContain(MOCK_DID)
    expect(MANAGED_AGGREGATED_DIDS).toContain(MANAGED_OWNER_GROUP_DID)
    expect(MANAGED_AGGREGATED_DIDS).toContain(MANAGED_ADMIN_GROUP_DID)
    expect(MANAGED_AGGREGATED_DIDS).not.toContain(MANAGED_MEMBER_GROUP_DID)
  })

  it("isManagedAuthorsRequest trips on owner/admin DIDs but not member-only", () => {
    expect(isManagedAuthorsRequest([MOCK_DID, MANAGED_OWNER_GROUP_DID])).toBe(true)
    expect(isManagedAuthorsRequest([MANAGED_ADMIN_GROUP_DID])).toBe(true)
    // The member group on its own is NOT an aggregation request.
    expect(isManagedAuthorsRequest([MANAGED_MEMBER_GROUP_DID])).toBe(false)
    // A bare personal request isn't the managed-aggregation request.
    expect(isManagedAuthorsRequest([MOCK_DID])).toBe(false)
    expect(isManagedAuthorsRequest(undefined)).toBe(false)
  })
})

describe("managed fixtures — connections are owned by the requested DIDs", () => {
  it("projects: every node is owned by an author in the request", () => {
    const conn = managedProjectsConnection(MANAGED_AGGREGATED_DIDS)
    expect(conn.totalCount).toBeGreaterThan(0)
    expect(conn.totalCount).toBe(conn.edges.length)
    for (const edge of conn.edges) {
      expect(MANAGED_AGGREGATED_DIDS).toContain(edge.node.did)
    }
    // Both the viewer and at least one group contribute → "via {group}".
    const dids = new Set(conn.edges.map((e) => e.node.did))
    expect(dids.has(MOCK_DID)).toBe(true)
    expect(dids.has(MANAGED_OWNER_GROUP_DID)).toBe(true)
  })

  it("activities: every node is owned by an author in the request", () => {
    const conn = managedActivitiesConnection(MANAGED_AGGREGATED_DIDS)
    expect(conn.totalCount).toBeGreaterThan(0)
    for (const edge of conn.edges) {
      expect(MANAGED_AGGREGATED_DIDS).toContain(edge.node.did)
    }
  })

  it("the member group never contributes records, even if smuggled in", () => {
    const withMember = [...MANAGED_AGGREGATED_DIDS, MANAGED_MEMBER_GROUP_DID]
    const projects = managedProjectsConnection(withMember)
    const activities = managedActivitiesConnection(withMember)
    for (const edge of [...projects.edges, ...activities.edges]) {
      expect(edge.node.did).not.toBe(MANAGED_MEMBER_GROUP_DID)
    }
  })

  it("a request with no managed DIDs yields no managed records", () => {
    expect(managedProjectsConnection([MANAGED_MEMBER_GROUP_DID]).totalCount).toBe(0)
    expect(managedActivitiesConnection([MANAGED_MEMBER_GROUP_DID]).totalCount).toBe(0)
  })
})

describe("managed fixtures — group resolution wiring", () => {
  it("memberships response carries all three groups with their roles", () => {
    const { groups, cursor } = managedGroupsMembershipsResponse()
    expect(cursor).toBeNull()
    expect(groups).toHaveLength(3)
    const roleByDid = Object.fromEntries(groups.map((g) => [g.groupDid, g.role]))
    expect(roleByDid[MANAGED_OWNER_GROUP_DID]).toBe("owner")
    expect(roleByDid[MANAGED_ADMIN_GROUP_DID]).toBe("admin")
    expect(roleByDid[MANAGED_MEMBER_GROUP_DID]).toBe("member")
  })

  it("managedGroups() returns all three as accepted with their roles", () => {
    const resolved = managedGroups()
    expect(resolved).toHaveLength(3)
    expect(resolved.every((g) => g.accepted)).toBe(true)
  })

  it("org profile + PLC doc resolve for managed DIDs, null for others", () => {
    const owner = MANAGED_GROUPS[0]
    expect(managedOrgProfile(owner.groupDid)?.displayName).toBe(owner.displayName)
    expect(managedPlcDidDocument(owner.groupDid)?.alsoKnownAs).toEqual([
      `at://${owner.handle}`,
    ])
    expect(managedOrgProfile("did:plc:unknown")).toBeNull()
    expect(managedPlcDidDocument("did:plc:unknown")).toBeNull()
  })
})
