import { describe, it, expect } from "vitest"

import { canRemoveMember } from "../org-settings"

// Members & Roles remove-button gate (mirrors CGS RBAC):
//   show remove only when member.did !== caller && member.role !== "owner"
//   && (isOwner || member.role === "member").
// So an ADMIN sees remove on members but not on other admins, the owner, or
// themselves; an OWNER sees remove on admins + members but not the owner or
// themselves.
describe("canRemoveMember", () => {
  const OWNER_DID = "did:plc:owner"
  const ADMIN_DID = "did:plc:admin"
  const OTHER_ADMIN_DID = "did:plc:admin2"
  const MEMBER_DID = "did:plc:member"

  describe("admin caller", () => {
    // The admin is acting on the list; isOwner is false.
    const isOwner = false
    const callerDid = ADMIN_DID

    it("shows remove on a plain member", () => {
      expect(
        canRemoveMember({
          memberDid: MEMBER_DID,
          memberRole: "member",
          callerDid,
          isOwner,
        }),
      ).toBe(true)
    })

    it("hides remove on another admin", () => {
      expect(
        canRemoveMember({
          memberDid: OTHER_ADMIN_DID,
          memberRole: "admin",
          callerDid,
          isOwner,
        }),
      ).toBe(false)
    })

    it("hides remove on the owner", () => {
      expect(
        canRemoveMember({
          memberDid: OWNER_DID,
          memberRole: "owner",
          callerDid,
          isOwner,
        }),
      ).toBe(false)
    })

    it("hides remove on themselves", () => {
      expect(
        canRemoveMember({
          memberDid: ADMIN_DID,
          memberRole: "admin",
          callerDid,
          isOwner,
        }),
      ).toBe(false)
    })
  })

  describe("owner caller", () => {
    const isOwner = true
    const callerDid = OWNER_DID

    it("shows remove on an admin", () => {
      expect(
        canRemoveMember({
          memberDid: ADMIN_DID,
          memberRole: "admin",
          callerDid,
          isOwner,
        }),
      ).toBe(true)
    })

    it("shows remove on a member", () => {
      expect(
        canRemoveMember({
          memberDid: MEMBER_DID,
          memberRole: "member",
          callerDid,
          isOwner,
        }),
      ).toBe(true)
    })

    it("hides remove on the owner (themselves)", () => {
      expect(
        canRemoveMember({
          memberDid: OWNER_DID,
          memberRole: "owner",
          callerDid,
          isOwner,
        }),
      ).toBe(false)
    })
  })
})
