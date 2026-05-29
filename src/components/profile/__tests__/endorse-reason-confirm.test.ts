import { describe, it, expect, vi } from "vitest"

import { runEndorseReasonConfirm } from "../endorse-reason-confirm"

// quality-048: the sidebar EndorseButton's reason-confirm flow created
// the award first, then (optionally) appended it to a list. The old
// ordering ran `ownGiven.refetch()` AFTER the list-append, inside a
// single try, so a list-append failure hit the catch which cleared the
// optimistic flag and rethrew — snapping the button back to "Endorse"
// even though the award itself succeeded. That nudges a duplicate
// endorsement.
//
// The fix: refetch the given-endorsements set right after the award
// succeeds (before the list-append), and on a list-append failure keep
// optimistic=true while still surfacing the attribution error.

const award = { uri: "at://did:plc:viewer/app.certified.badge.award/abc", cid: "cid123" }

function makeDeps(overrides: Partial<Parameters<typeof runEndorseReasonConfirm>[0]> = {}) {
  return {
    note: "great work",
    listRkey: null as string | null,
    createAward: vi.fn(async () => award),
    appendToList: vi.fn(async () => {}),
    refetchGiven: vi.fn(async () => {}),
    refetchLists: vi.fn(async () => {}),
    setOptimistic: vi.fn(),
    ...overrides,
  }
}

describe("runEndorseReasonConfirm", () => {
  it("refetches given endorsements before appending to the list", async () => {
    const order: string[] = []
    const deps = makeDeps({
      listRkey: "list-1",
      refetchGiven: vi.fn(async () => {
        order.push("refetchGiven")
      }),
      appendToList: vi.fn(async () => {
        order.push("appendToList")
      }),
    })

    await runEndorseReasonConfirm(deps)

    // The given-set refetch must happen BEFORE the list append so a
    // failing append can't roll the (already-persisted) award state back.
    expect(order).toEqual(["refetchGiven", "appendToList"])
  })

  it("keeps optimistic=true and rethrows when the list-append fails", async () => {
    const appendErr = new Error("list append failed")
    const deps = makeDeps({
      listRkey: "list-1",
      appendToList: vi.fn(async () => {
        throw appendErr
      }),
    })

    await expect(runEndorseReasonConfirm(deps)).rejects.toBe(appendErr)

    // Award succeeded, so the given-set was refetched...
    expect(deps.refetchGiven).toHaveBeenCalledTimes(1)
    // ...and the optimistic flag must NOT be cleared — the button stays
    // on "Endorsed".
    expect(deps.setOptimistic).not.toHaveBeenCalledWith(null)
  })

  it("clears optimistic and rethrows when the award itself fails", async () => {
    const awardErr = new Error("award failed")
    const deps = makeDeps({
      listRkey: "list-1",
      createAward: vi.fn(async () => {
        throw awardErr
      }),
    })

    await expect(runEndorseReasonConfirm(deps)).rejects.toBe(awardErr)

    // The award never landed — roll the optimistic flag back and never
    // touch the list.
    expect(deps.setOptimistic).toHaveBeenCalledWith(null)
    expect(deps.refetchGiven).not.toHaveBeenCalled()
    expect(deps.appendToList).not.toHaveBeenCalled()
  })

  it("skips the list append and refetch when no list is selected", async () => {
    const deps = makeDeps({ listRkey: null })

    await runEndorseReasonConfirm(deps)

    expect(deps.createAward).toHaveBeenCalledTimes(1)
    expect(deps.refetchGiven).toHaveBeenCalledTimes(1)
    expect(deps.appendToList).not.toHaveBeenCalled()
    expect(deps.refetchLists).not.toHaveBeenCalled()
    expect(deps.setOptimistic).not.toHaveBeenCalledWith(null)
  })

  // PR #110: the sidebar pushes the new award into the shared
  // received-endorsements overlay the instant it lands, via onAwardCreated.
  it("fires onAwardCreated with the award before the given-set refetch", async () => {
    const order: string[] = []
    const deps = makeDeps({
      onAwardCreated: vi.fn(() => {
        order.push("onAwardCreated")
      }),
      refetchGiven: vi.fn(async () => {
        order.push("refetchGiven")
      }),
    })

    await runEndorseReasonConfirm(deps)

    expect(deps.onAwardCreated).toHaveBeenCalledTimes(1)
    expect(deps.onAwardCreated).toHaveBeenCalledWith(award)
    // The optimistic overlay push must happen before the refetch so the
    // counter/Received tab update immediately, not after the slow scan.
    expect(order).toEqual(["onAwardCreated", "refetchGiven"])
  })

  it("does not fire onAwardCreated when the award itself fails", async () => {
    const deps = makeDeps({
      createAward: vi.fn(async () => {
        throw new Error("award failed")
      }),
      onAwardCreated: vi.fn(),
    })

    await expect(runEndorseReasonConfirm(deps)).rejects.toThrow("award failed")
    expect(deps.onAwardCreated).not.toHaveBeenCalled()
  })
})
