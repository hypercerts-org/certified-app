import { describe, it, expect } from "vitest"
import { OPERATIONS } from "../operations"
import { ENDORSEMENT_LIST_TYPE } from "@/lib/atproto/collection"
import { TYPED_LIST_TYPES } from "@/lib/atproto/typed-lists"

// P1-2: the Overview's Lists figure links to Lists, which shows every list
// kind (endorsement lists and the typed activity / project / account
// lists), so the count must cover all of them, not endorsement lists only.
describe("ActorWorkspaceCounts: lists", () => {
  const query = OPERATIONS.ActorWorkspaceCounts
  const lists = query.slice(query.indexOf("lists:"), query.indexOf("endorsementsReceived:"))

  it("counts every list kind the Lists view shows", () => {
    for (const type of [ENDORSEMENT_LIST_TYPE, ...TYPED_LIST_TYPES]) {
      expect(lists).toContain(`"${type}"`)
    }
    expect(lists).toMatch(/type:\s*\{\s*in:/)
  })

  it("still counts only this account's lists", () => {
    expect(lists).toContain("did: { eq: $did }")
  })
})
