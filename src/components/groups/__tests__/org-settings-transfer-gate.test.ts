import { describe, it, expect } from "vitest"
import {
  transferViewerRole,
  eligibleTransferTargets,
} from "../org-settings"
import type { OrgRole } from "@/lib/groups/types"

/**
 * Who sees the Transfer ownership page, and who may be proposed.
 *
 * The disclosure rule is the point: CGS reports `pending: false` to a member
 * who is not a party to a transfer, exactly as it does when none exists. The
 * UI must therefore derive "show this page" from the response alone and never
 * try to tell those two states apart.
 */

const OWNER = "did:plc:owner"
const ALICE = "did:plc:alice"
const BOB = "did:plc:bob"

const pendingFor = (proposedOwner: string) =>
  ({
    groupDid: "did:plc:group",
    pending: true as const,
    proposedOwner,
    proposedBy: OWNER,
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-08T00:00:00.000Z",
  })

const nothingPending = {
  groupDid: "did:plc:group",
  pending: false as const,
}

describe("transferViewerRole", () => {
  it("treats the owner as a party whether or not a transfer is pending", () => {
    expect(
      transferViewerRole({ transfer: null, callerDid: OWNER, isOwner: true }),
    ).toBe("owner")
    expect(
      transferViewerRole({
        transfer: pendingFor(ALICE),
        callerDid: OWNER,
        isOwner: true,
      }),
    ).toBe("owner")
  })

  it("makes the proposed member the recipient", () => {
    expect(
      transferViewerRole({
        transfer: pendingFor(ALICE),
        callerDid: ALICE,
        isOwner: false,
      }),
    ).toBe("recipient")
  })

  it("gives a member proposed to someone else nothing", () => {
    expect(
      transferViewerRole({
        transfer: pendingFor(ALICE),
        callerDid: BOB,
        isOwner: false,
      }),
    ).toBe("none")
  })

  it("gives a non-party the same 'none' as when nothing is pending", () => {
    // What a bystander actually receives from CGS is `pending: false`, so
    // this is the case that really matters.
    expect(
      transferViewerRole({
        transfer: nothingPending,
        callerDid: BOB,
        isOwner: false,
      }),
    ).toBe("none")
  })

  it("returns 'none' when the caller DID is unknown", () => {
    for (const callerDid of [null, undefined, ""]) {
      expect(
        transferViewerRole({
          transfer: pendingFor(ALICE),
          callerDid,
          isOwner: false,
        }),
      ).toBe("none")
    }
  })

  it("returns 'none' before the status call resolves", () => {
    expect(
      transferViewerRole({ transfer: null, callerDid: ALICE, isOwner: false }),
    ).toBe("none")
  })
})

describe("eligibleTransferTargets", () => {
  const members: { did: string; role: OrgRole }[] = [
    { did: OWNER, role: "owner" },
    { did: ALICE, role: "admin" },
    { did: BOB, role: "member" },
  ]

  it("offers admins and members, never the current owner", () => {
    // CGS rejects proposing the incumbent with `AlreadyOwner`.
    expect(eligibleTransferTargets(members, OWNER).map((m) => m.did)).toEqual([
      ALICE,
      BOB,
    ])
  })

  it("never offers the caller themselves", () => {
    expect(eligibleTransferTargets(members, ALICE).map((m) => m.did)).toEqual([
      BOB,
    ])
  })

  it("is empty for a group whose only member is the owner", () => {
    expect(eligibleTransferTargets([{ did: OWNER, role: "owner" }], OWNER)).toEqual(
      [],
    )
  })
})
