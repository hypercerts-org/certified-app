/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest"
import { clearAllDraftsForViewer, computeDirtyFields } from "../swap-drafts"

const DID_A = "did:plc:alice"
const DID_B = "did:plc:bob"
const COLLECTION = "org.hypercerts.claim.activity"

/**
 * Seed a legacy draft key directly. Current builds no longer write
 * drafts (the save/restore flow was removed), but older builds did —
 * the logout purge still has to clear what they left behind, so the
 * tests reproduce the historical key shape verbatim.
 */
function seedLegacyDraft(
  viewerDid: string,
  collection: string,
  rkey: string,
  drafts: unknown,
): void {
  window.localStorage.setItem(
    `swap-draft:${viewerDid}:${collection}:${rkey}`,
    JSON.stringify({ savedAt: Date.now(), drafts }),
  )
}

function readDraftKey(
  viewerDid: string,
  collection: string,
  rkey: string,
): string | null {
  return window.localStorage.getItem(
    `swap-draft:${viewerDid}:${collection}:${rkey}`,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("clearAllDraftsForViewer", () => {
  it("removes every draft for the given viewer and leaves other viewers alone", () => {
    seedLegacyDraft(DID_A, COLLECTION, "r1", { v: 1 })
    seedLegacyDraft(DID_A, COLLECTION, "r2", { v: 2 })
    seedLegacyDraft(DID_B, COLLECTION, "r1", { v: 3 })
    clearAllDraftsForViewer(DID_A)
    expect(readDraftKey(DID_A, COLLECTION, "r1")).toBeNull()
    expect(readDraftKey(DID_A, COLLECTION, "r2")).toBeNull()
    // Bob's draft survives.
    expect(readDraftKey(DID_B, COLLECTION, "r1")).not.toBeNull()
  })

  it("is a no-op when no drafts exist for the viewer", () => {
    seedLegacyDraft(DID_B, COLLECTION, "rkey1", { v: 1 })
    clearAllDraftsForViewer(DID_A)
    expect(readDraftKey(DID_B, COLLECTION, "rkey1")).not.toBeNull()
  })

  it("leaves unrelated localStorage keys alone", () => {
    window.localStorage.setItem("unrelated-key", "keep-me")
    seedLegacyDraft(DID_A, COLLECTION, "r1", { v: 1 })
    clearAllDraftsForViewer(DID_A)
    expect(window.localStorage.getItem("unrelated-key")).toBe("keep-me")
  })
})

describe("computeDirtyFields", () => {
  it("returns empty when snapshot and drafts are identical", () => {
    expect(
      computeDirtyFields(
        { title: "A", shortDescription: "B" },
        { title: "A", shortDescription: "B" },
      ),
    ).toEqual([])
  })

  it("detects a single string-field change", () => {
    expect(
      computeDirtyFields(
        { title: "A", shortDescription: "B" },
        { title: "A2", shortDescription: "B" },
      ),
    ).toEqual(["title"])
  })

  it("detects multiple changes", () => {
    const dirty = computeDirtyFields(
      { title: "A", shortDescription: "B", n: 1 },
      { title: "A2", shortDescription: "B2", n: 1 },
    )
    expect(dirty.sort()).toEqual(["shortDescription", "title"])
  })

  it("treats null vs '' as different (no coercion)", () => {
    expect(
      computeDirtyFields(
        { foo: null as unknown as string },
        { foo: "" },
      ),
    ).toEqual(["foo"])
  })

  it("detects a key added in drafts but absent in snapshot", () => {
    expect(
      computeDirtyFields(
        {} as Record<string, unknown>,
        { newKey: "x" },
      ),
    ).toEqual(["newKey"])
  })

  it("detects a key removed in drafts (snapshot key with undefined value)", () => {
    expect(
      computeDirtyFields(
        { foo: "x" } as Record<string, unknown>,
        {} as Record<string, unknown>,
      ),
    ).toEqual(["foo"])
  })

  it("treats arrays-of-primitives via JSON serialization (deep-ish)", () => {
    // same content
    expect(
      computeDirtyFields({ tags: ["a", "b"] }, { tags: ["a", "b"] }),
    ).toEqual([])
    // different order — considered changed (JSON.stringify is order-
    // sensitive on arrays).
    expect(
      computeDirtyFields({ tags: ["a", "b"] }, { tags: ["b", "a"] }),
    ).toEqual(["tags"])
  })

  it("treats nested objects via JSON serialization", () => {
    expect(
      computeDirtyFields(
        { obj: { x: 1, y: 2 } },
        { obj: { x: 1, y: 2 } },
      ),
    ).toEqual([])
    expect(
      computeDirtyFields(
        { obj: { x: 1, y: 2 } },
        { obj: { x: 1, y: 3 } },
      ),
    ).toEqual(["obj"])
  })
})
