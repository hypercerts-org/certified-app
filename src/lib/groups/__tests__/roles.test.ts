import { describe, it, expect } from "vitest"
import {
  ORG_ROLES,
  ORG_ASSIGNABLE_ROLES,
  isOrgRole,
  isAssignableRole,
} from "@/lib/groups/constants"

/**
 * authz-repo-3: the members-POST and role-PUT allowlists used to be two
 * bare arrays duplicated across two route files and could silently drift.
 * They now derive from one ORG_ROLES source of truth. These tests pin the
 * EXACT current sets so a future edit can't widen/narrow either guard by
 * accident:
 *   - role PUT  allows {member, admin, owner}  (ORG_ROLES)
 *   - members POST allows {member, admin}      (ORG_ASSIGNABLE_ROLES, NOT owner)
 */
describe("group role allowlists", () => {
  it("ORG_ROLES is exactly {member, admin, owner}", () => {
    expect([...ORG_ROLES].sort()).toEqual(["admin", "member", "owner"])
  })

  it("ORG_ASSIGNABLE_ROLES is exactly {member, admin} — owner is excluded", () => {
    expect([...ORG_ASSIGNABLE_ROLES].sort()).toEqual(["admin", "member"])
    expect(ORG_ASSIGNABLE_ROLES).not.toContain("owner")
  })

  it("the assignable allowlist is a strict subset derived from ORG_ROLES", () => {
    for (const role of ORG_ASSIGNABLE_ROLES) {
      expect(ORG_ROLES).toContain(role)
    }
    expect(ORG_ASSIGNABLE_ROLES.length).toBeLessThan(ORG_ROLES.length)
  })

  it("isOrgRole accepts all three roles and rejects unknown values", () => {
    expect(isOrgRole("member")).toBe(true)
    expect(isOrgRole("admin")).toBe(true)
    expect(isOrgRole("owner")).toBe(true)
    expect(isOrgRole("superuser")).toBe(false)
    expect(isOrgRole("")).toBe(false)
  })

  it("isAssignableRole accepts member/admin but rejects owner", () => {
    expect(isAssignableRole("member")).toBe(true)
    expect(isAssignableRole("admin")).toBe(true)
    expect(isAssignableRole("owner")).toBe(false)
    expect(isAssignableRole("nope")).toBe(false)
  })
})
