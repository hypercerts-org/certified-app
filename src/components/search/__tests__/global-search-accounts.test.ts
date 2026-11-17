import { describe, it, expect, vi } from "vitest"

// The sidebar search's Accounts group: accounts on the Certified network
// first, then Bluesky-only accounts to fill it, never one twice, three at
// most (records lead the dropdown; accounts are a short group after them).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { mergeAccounts, type SearchAccount } from "../global-search"

function certified(did: string, displayName: string): SearchAccount {
  return { did, handle: null, displayName, avatar: null, certified: true }
}

function bsky(did: string, handle: string, displayName = "") {
  return { did, handle, displayName, avatar: null }
}

describe("mergeAccounts", () => {
  it("puts Certified accounts before Bluesky-only ones", () => {
    const out = mergeAccounts(
      "estuary",
      [certified("did:plc:c1", "Estuary Alliance")],
      [bsky("did:plc:b1", "estuary.bsky.social", "Estuary fan")],
    )
    expect(out.map((a) => a.did)).toEqual(["did:plc:c1", "did:plc:b1"])
    expect(out[0].certified).toBe(true)
    expect(out[1].certified).toBe(false)
  })

  it("lists an account found in both sources once, as Certified", () => {
    const out = mergeAccounts(
      "estuary",
      [certified("did:plc:c1", "Estuary Alliance")],
      [bsky("did:plc:c1", "estuary-alliance.certified.app", "Estuary Alliance")],
    )
    expect(out).toHaveLength(1)
    expect(out[0].certified).toBe(true)
  })

  it("shows three accounts at most", () => {
    const out = mergeAccounts(
      "a",
      [certified("did:plc:c1", "Ana"), certified("did:plc:c2", "Abe")],
      [bsky("did:plc:b1", "a1.bsky.social"), bsky("did:plc:b2", "a2.bsky.social")],
    )
    expect(out.map((a) => a.did)).toEqual(["did:plc:c1", "did:plc:c2", "did:plc:b1"])
  })

  it("ranks Certified accounts by how well the name matches", () => {
    const out = mergeAccounts(
      "mangrove",
      [certified("did:plc:c1", "Coastal group"), certified("did:plc:c2", "Mangrove Trust")],
      [],
    )
    expect(out[0].did).toBe("did:plc:c2")
  })
})

describe("mergeAccounts, an account in both sources", () => {
  it("borrows the Bluesky handle for the Certified profile", () => {
    const out = mergeAccounts(
      "estuary",
      [certified("did:plc:c1", "Estuary Alliance")],
      [bsky("did:plc:c1", "estuary-alliance.certified.app", "Old name")],
    )
    expect(out[0]).toMatchObject({
      displayName: "Estuary Alliance",
      handle: "estuary-alliance.certified.app",
      certified: true,
    })
  })
})
