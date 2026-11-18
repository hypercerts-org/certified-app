import { describe, it, expect } from "vitest"
import { pasteTip } from "../profile-lists"

// The account list's tip names the at:// address as the app does
// everywhere else: a Permanent ID, not a DID.
describe("pasteTip", () => {
  it("says Permanent IDs for account lists", () => {
    expect(pasteTip("list:accounts")).toBe(
      "Add accounts one at a time, or paste many handles, Permanent IDs or links at once with Paste many.",
    )
    expect(pasteTip("list:accounts")).not.toMatch(/\bDIDs?\b/)
  })
})
