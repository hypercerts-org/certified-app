import { describe, it, expect } from "vitest"

import { remainingAfterAddIndex } from "../org-settings"

// groups-6: when the add-members loop fails part-way through, the members
// that were already added successfully must NOT be left staged for re-add.
// `remainingAfterAddIndex` returns only the members from the failing index
// onward (the one that failed plus any not-yet-attempted), so re-submitting
// won't double-add the ones the service already accepted.
describe("remainingAfterAddIndex", () => {
  const members = [
    { did: "did:a", handle: "a" },
    { did: "did:b", handle: "b" },
    { did: "did:c", handle: "c" },
  ]

  it("drops members added before the failing index", () => {
    // Failed while adding index 1 (did:b): did:a already succeeded.
    expect(remainingAfterAddIndex(members, 1)).toEqual([
      { did: "did:b", handle: "b" },
      { did: "did:c", handle: "c" },
    ])
  })

  it("keeps the whole list when the very first add fails", () => {
    expect(remainingAfterAddIndex(members, 0)).toEqual(members)
  })

  it("keeps only the last member when all earlier ones succeeded", () => {
    expect(remainingAfterAddIndex(members, 2)).toEqual([
      { did: "did:c", handle: "c" },
    ])
  })
})
