/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  saveDraft,
  loadDraft,
  clearDraft,
  clearAllDraftsForViewer,
  computeDirtyFields,
} from "../swap-drafts"

const DID_A = "did:plc:alice"
const DID_B = "did:plc:bob"
const COLLECTION = "org.hypercerts.claim.activity"
const RKEY = "rkey1"

beforeEach(() => {
  window.localStorage.clear()
})

describe("saveDraft / loadDraft / clearDraft round-trip", () => {
  it("saves and loads the same payload back", () => {
    const draft = { title: "Hello", shortDescription: "world" }
    saveDraft(DID_A, COLLECTION, RKEY, draft)
    const loaded = loadDraft<typeof draft>(DID_A, COLLECTION, RKEY)
    expect(loaded?.drafts).toEqual(draft)
    expect(typeof loaded?.savedAt).toBe("number")
  })

  it("returns null when no draft is stored", () => {
    expect(loadDraft(DID_A, COLLECTION, RKEY)).toBeNull()
  })

  it("clearDraft removes the entry", () => {
    saveDraft(DID_A, COLLECTION, RKEY, { x: 1 })
    clearDraft(DID_A, COLLECTION, RKEY)
    expect(loadDraft(DID_A, COLLECTION, RKEY)).toBeNull()
  })

  it("keys are scoped per (viewerDid, collection, rkey) — no cross-account leakage", () => {
    saveDraft(DID_A, COLLECTION, RKEY, { who: "alice" })
    saveDraft(DID_B, COLLECTION, RKEY, { who: "bob" })
    expect(loadDraft(DID_A, COLLECTION, RKEY)?.drafts).toEqual({
      who: "alice",
    })
    expect(loadDraft(DID_B, COLLECTION, RKEY)?.drafts).toEqual({
      who: "bob",
    })
  })

  it("keys are scoped per collection — no collision between record types under the same rkey", () => {
    saveDraft(DID_A, "org.hypercerts.claim.activity", RKEY, { kind: "cert" })
    saveDraft(DID_A, "org.hypercerts.collection", RKEY, { kind: "project" })
    expect(
      loadDraft(DID_A, "org.hypercerts.claim.activity", RKEY)?.drafts,
    ).toEqual({ kind: "cert" })
    expect(
      loadDraft(DID_A, "org.hypercerts.collection", RKEY)?.drafts,
    ).toEqual({ kind: "project" })
  })

  it("loadDraft returns null when the stored payload is malformed", () => {
    window.localStorage.setItem(
      `swap-draft:${DID_A}:${COLLECTION}:${RKEY}`,
      "not-json",
    )
    expect(loadDraft(DID_A, COLLECTION, RKEY)).toBeNull()
  })

  it("loadDraft returns null when savedAt is missing", () => {
    window.localStorage.setItem(
      `swap-draft:${DID_A}:${COLLECTION}:${RKEY}`,
      JSON.stringify({ drafts: { x: 1 } }),
    )
    expect(loadDraft(DID_A, COLLECTION, RKEY)).toBeNull()
  })
})

describe("clearAllDraftsForViewer", () => {
  it("removes every draft for the given viewer and leaves other viewers alone", () => {
    saveDraft(DID_A, COLLECTION, "r1", { v: 1 })
    saveDraft(DID_A, COLLECTION, "r2", { v: 2 })
    saveDraft(DID_B, COLLECTION, "r1", { v: 3 })
    clearAllDraftsForViewer(DID_A)
    expect(loadDraft(DID_A, COLLECTION, "r1")).toBeNull()
    expect(loadDraft(DID_A, COLLECTION, "r2")).toBeNull()
    // Bob's draft survives.
    expect(loadDraft(DID_B, COLLECTION, "r1")?.drafts).toEqual({ v: 3 })
  })

  it("is a no-op when no drafts exist for the viewer", () => {
    saveDraft(DID_B, COLLECTION, RKEY, { v: 1 })
    clearAllDraftsForViewer(DID_A)
    expect(loadDraft(DID_B, COLLECTION, RKEY)?.drafts).toEqual({ v: 1 })
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
