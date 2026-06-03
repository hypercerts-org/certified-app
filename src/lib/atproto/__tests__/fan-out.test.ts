import { describe, it, expect, vi, afterEach } from "vitest"
import { fanOut } from "../fan-out"

describe("fanOut — per-DID error isolation", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns each DID's items, preserving order", async () => {
    const out = await fanOut(["a", "b"], async (did) => [`${did}1`, `${did}2`])
    expect(out).toEqual([
      { did: "a", items: ["a1", "a2"] },
      { did: "b", items: ["b1", "b2"] },
    ])
  })

  it("isolates a per-DID failure to an empty list, not a batch reject", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const out = await fanOut(["a", "b"], async (did) => {
      if (did === "b") throw new Error("PDS down")
      return [`${did}1`]
    })
    expect(out).toEqual([
      { did: "a", items: ["a1"] },
      { did: "b", items: [] },
    ])
  })

  it("re-throws an AbortError so the caller sees cancellation, not []", async () => {
    const abort = async () => {
      throw new DOMException("aborted", "AbortError")
    }
    await expect(fanOut(["a"], abort)).rejects.toBeInstanceOf(DOMException)
  })
})
