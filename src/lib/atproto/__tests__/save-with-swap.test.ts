import { describe, it, expect } from "vitest"
import { saveWithSwap } from "../save-with-swap"
import { InvalidSwapError } from "../repo-write"
import { computeDirtyFields } from "@/lib/utils/swap-drafts"

/**
 * quality-025: saveWithSwap's cross-shape contract.
 *
 * Two guarantees are covered here:
 *
 *  1. Runtime (behavior-preserving): a dirty draft field whose fresh
 *     server value ALSO diverged from the mount snapshot must be
 *     reported as a same-field conflict — the silent rebase must not
 *     swallow it.
 *
 *  2. Type-level (the fix): `TDrafts` is constrained to
 *     `Partial<TSnapshot>`, so a draft shape carrying a key absent from
 *     the snapshot is a compile error rather than a silently-untracked
 *     field. The `@ts-expect-error` below is load-bearing — it fails
 *     `tsc` if the constraint is ever relaxed back to an unrelated
 *     generic.
 */

type Snapshot = { title: string; body: string }

describe("saveWithSwap conflict detection (runtime contract)", () => {
  it("reports a same-field conflict when the touched field also moved on the server", async () => {
    const mountSnapshot: Snapshot = { title: "Original", body: "Hello" }

    let writeAttempts = 0
    const result = await saveWithSwap<Snapshot, Snapshot>({
      mountSnapshot,
      initialCid: "cid-at-mount",
      // User edited `title`; `body` rides along unchanged.
      drafts: { title: "User edit", body: "Hello" },
      computeNext: (_server, drafts) => drafts,
      write: async () => {
        writeAttempts++
        // First (and only) write attempt 409s, forcing a re-read.
        throw new InvalidSwapError()
      },
      // Server changed the SAME field (`title`) the user touched.
      read: async () => ({
        value: { title: "Concurrent server edit", body: "Hello" },
        cid: "cid-fresh",
      }),
    })

    expect(writeAttempts).toBe(1)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected conflict")
    expect(result.reason).toBe("conflict")
    if (result.reason !== "conflict") throw new Error("expected conflict")
    expect(result.conflictingFields).toContain("title")
    expect(result.conflictingFields).not.toContain("body")
  })

  it("silently rebases when the server moved a disjoint field", async () => {
    const mountSnapshot: Snapshot = { title: "Original", body: "Hello" }

    let writeAttempts = 0
    const result = await saveWithSwap<Snapshot, Snapshot>({
      mountSnapshot,
      initialCid: "cid-at-mount",
      // User edited only `title`.
      drafts: { title: "User edit", body: "Hello" },
      computeNext: (_server, drafts) => drafts,
      write: async (_next, swapRecord) => {
        writeAttempts++
        // First attempt 409s on the stale CID; the retry with the
        // fresh CID succeeds.
        if (swapRecord === "cid-at-mount") throw new InvalidSwapError()
      },
      // Server changed a DISJOINT field (`body`).
      read: async () => ({
        value: { title: "Original", body: "Server changed body" },
        cid: "cid-fresh",
      }),
    })

    expect(writeAttempts).toBe(2)
    expect(result.ok).toBe(true)
  })
})

describe("saveWithSwap drafts/snapshot type contract", () => {
  it("rejects a drafts shape whose key collides with the snapshot under a different type", () => {
    // Type-level assertion (the quality-025 fix). `TDrafts extends
    // Partial<TSnapshot>` means a draft key shared with the snapshot
    // must carry a compatible value type. Here `title` is a `number`
    // where the snapshot declares it a `string`, so the constrained
    // generic rejects it. Before the fix (`TDrafts extends
    // Record<string, unknown>`) any value type was accepted and this
    // `@ts-expect-error` would be flagged as an unused directive.
    // The call is never executed; the directive IS the assertion.
    const guard = () =>
      // @ts-expect-error - draft `title` is a number; snapshot's is a string
      saveWithSwap<Snapshot, { title: number }>({
        mountSnapshot: { title: "x", body: "y" },
        initialCid: "cid",
        drafts: { title: 1 },
        computeNext: (_server, _drafts) => ({ title: "x", body: "y" }),
        write: async () => {},
        read: async () => ({ value: { title: "x", body: "y" }, cid: "c" }),
      })
    expect(typeof guard).toBe("function")
  })

  it("accepts a drafts shape that is a partial of the snapshot", () => {
    // The conforming case must still compile: a strict subset of the
    // snapshot's keys with matching value types.
    const guard = () =>
      saveWithSwap<Snapshot, { title: string }>({
        mountSnapshot: { title: "x", body: "y" },
        initialCid: "cid",
        drafts: { title: "x" },
        computeNext: (_server, _drafts) => ({ title: "x", body: "y" }),
        write: async () => {},
        read: async () => ({ value: { title: "x", body: "y" }, cid: "c" }),
      })
    expect(typeof guard).toBe("function")
  })
})

describe("saveWithSwap shares one shallowEqual with the dirty-set step (quality-026)", () => {
  // Both halves of the save flow — the dirty-set computation
  // (computeDirtyFields in swap-drafts) and the conflict detection
  // (saveWithSwap) — must classify an array-vs-object edge the SAME
  // way. They previously used two divergent shallowEqual copies; the
  // fix exports one array-guarded variant and reuses it in both, so
  // the array-vs-object edge can never be classified inconsistently
  // between the two steps.
  type ListSnap = { tags: unknown }

  it("treats [] vs {} consistently across the dirty-set and conflict steps", async () => {
    // 1) Dirty-set step: snapshot tags=[] , drafts tags={} -> dirty.
    const dirty = computeDirtyFields<ListSnap>(
      { tags: [] },
      { tags: {} },
    )
    expect(dirty).toContain("tags")

    // 2) Conflict step: the user touched `tags` ([] -> {}), and the
    //    fresh server value for `tags` ALSO diverges from the mount
    //    snapshot ([] -> {}). Because both steps share the same
    //    array-guarded comparator, the [] -> {} move is recognized as a
    //    real change and surfaces as a same-field conflict — it must
    //    not be silently swallowed.
    const mountSnapshot: ListSnap = { tags: [] }
    const result = await saveWithSwap<ListSnap, ListSnap>({
      mountSnapshot,
      initialCid: "cid-at-mount",
      drafts: { tags: {} },
      computeNext: (_server, drafts) => drafts,
      write: async () => {
        throw new InvalidSwapError()
      },
      read: async () => ({ value: { tags: {} }, cid: "cid-fresh" }),
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected conflict")
    expect(result.reason).toBe("conflict")
    if (result.reason !== "conflict") throw new Error("expected conflict")
    expect(result.conflictingFields).toContain("tags")
  })
})
