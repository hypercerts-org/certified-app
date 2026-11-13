import { describe, expect, it } from "vitest"
import { itemRowsFromRecord, nextProjectItems } from "../project-edit-items"

const act = (rkey: string) => `at://did:plc:me/org.hypercerts.claim.activity/${rkey}`
const entry = (rkey: string, extra: Record<string, unknown> = {}) => ({
  itemIdentifier: { uri: act(rkey), cid: `cid-${rkey}` },
  ...extra,
})
const subProject = {
  itemIdentifier: { uri: "at://did:plc:me/org.hypercerts.collection/p1", cid: "cid-p1" },
}

describe("itemRowsFromRecord", () => {
  it("lists every activity in the project's order, once each", () => {
    const rows = itemRowsFromRecord([entry("a"), subProject, entry("b"), entry("a"), entry("c")])
    expect(rows.map((r) => r.uri)).toEqual([act("a"), act("b"), act("c")])
    expect(rows[0].raw).toEqual(entry("a"))
  })

  it("returns nothing for a missing or malformed items field", () => {
    expect(itemRowsFromRecord(undefined)).toEqual([])
    expect(itemRowsFromRecord("nope")).toEqual([])
    expect(itemRowsFromRecord([null, { itemIdentifier: { uri: act("a") } }])).toEqual([])
  })
})

describe("nextProjectItems", () => {
  it("writes the original array back untouched when nothing changed", () => {
    const original = [entry("a", { itemWeight: "2" }), subProject, entry("b")]
    const rows = itemRowsFromRecord(original)
    expect(nextProjectItems(original, rows)).toBe(original)
  })

  it("keeps existing entries as they were, adds new ones and keeps non-activities", () => {
    const original = [entry("a", { itemWeight: "2" }), subProject, entry("b")]
    const rows = [
      ...itemRowsFromRecord(original).filter((r) => r.uri !== act("b")),
      { uri: act("c"), cid: "cid-c", raw: null },
    ]
    expect(nextProjectItems(original, rows)).toEqual([
      entry("a", { itemWeight: "2" }),
      entry("c"),
      subProject,
    ])
  })

  it("returns undefined when the last activity is removed and nothing else is left", () => {
    expect(nextProjectItems([entry("a")], [])).toBeUndefined()
    expect(nextProjectItems(undefined, [])).toBeUndefined()
  })
})
