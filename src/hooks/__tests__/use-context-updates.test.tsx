import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"

// Controllable mock of fetchContextUpdates. Each call records its subject
// URI and returns a deferred promise we settle by hand, so a test can
// hold a fetch in-flight while a second instance mounts.
interface PendingFetch {
  subjectUri: string
  resolve: (records: unknown[]) => void
  reject: (err: unknown) => void
}

const calls: PendingFetch[] = []

vi.mock("@/lib/atproto/context-attachment", () => ({
  fetchContextUpdates: vi.fn(
    (_did: string, subjectUri: string) =>
      new Promise((resolve, reject) => {
        calls.push({ subjectUri, resolve, reject })
      }),
  ),
}))

import {
  useContextUpdates,
  invalidateContextUpdates,
} from "../use-context-updates"

/** Minimal update record — only the fields the hook touches. */
function record(uri: string, createdAt: string) {
  return {
    uri,
    cid: "bafyupdate",
    value: { contentType: "update", title: "t", createdAt },
  }
}

const callsFor = (uri: string) => calls.filter((c) => c.subjectUri === uri)

/** Settle the newest pending fetch for `uri` inside act(). */
async function resolveLatest(uri: string, records: unknown[]) {
  await act(async () => {
    const pending = callsFor(uri)
    pending[pending.length - 1].resolve(records)
  })
}

beforeEach(() => {
  cleanup()
  calls.length = 0
})

// Unique subject URIs per test — the cache under test is module-level
// and persists across tests in this file.
const subject = (n: string) =>
  `at://did:plc:ctx${n}/org.hypercerts.claim.activity/rkey${n}`

describe("useContextUpdates — shared cache + in-flight coalescing", () => {
  it("two mounted instances share one fetch and both receive the sorted list", async () => {
    const uri = subject("share")
    const a = renderHook(() => useContextUpdates(uri))
    const b = renderHook(() => useContextUpdates(uri))
    await waitFor(() => expect(callsFor(uri)).toHaveLength(1))

    await resolveLatest(uri, [
      record(`${uri}#u-old`, "2026-01-01T00:00:00Z"),
      record(`${uri}#u-new`, "2026-02-01T00:00:00Z"),
    ])

    // One network call total; both instances see createdAt-DESC order.
    expect(callsFor(uri)).toHaveLength(1)
    const uris = (h: typeof a) => h.result.current.updates.map((u) => u.uri)
    expect(uris(a)).toEqual([`${uri}#u-new`, `${uri}#u-old`])
    expect(uris(b)).toEqual(uris(a))
  })

  it("removeUpdate patches every mounted instance and tombstones the URI against a stale refetch", async () => {
    const uri = subject("remove")
    const a = renderHook(() => useContextUpdates(uri))
    const b = renderHook(() => useContextUpdates(uri))
    await waitFor(() => expect(callsFor(uri)).toHaveLength(1))
    await resolveLatest(uri, [
      record(`${uri}#u1`, "2026-01-01T00:00:00Z"),
      record(`${uri}#u2`, "2026-02-01T00:00:00Z"),
    ])

    // Delete via instance A — instance B (e.g. the navbar count) must
    // converge without its own refetch.
    act(() => {
      a.result.current.removeUpdate(`${uri}#u2`)
    })
    expect(a.result.current.updates.map((u) => u.uri)).toEqual([`${uri}#u1`])
    expect(b.result.current.updates.map((u) => u.uri)).toEqual([`${uri}#u1`])

    // The reconcile refetch still returns the deleted record (indexer
    // lag) — the tombstone keeps it from resurrecting.
    act(() => {
      b.result.current.refetch()
    })
    await waitFor(() => expect(callsFor(uri)).toHaveLength(2))
    await resolveLatest(uri, [
      record(`${uri}#u1`, "2026-01-01T00:00:00Z"),
      record(`${uri}#u2`, "2026-02-01T00:00:00Z"),
    ])
    expect(a.result.current.updates.map((u) => u.uri)).toEqual([`${uri}#u1`])
    expect(b.result.current.updates.map((u) => u.uri)).toEqual([`${uri}#u1`])
  })

  it("a remount inside the freshness window serves the cache without a new fetch", async () => {
    const uri = subject("remount")
    const a = renderHook(() => useContextUpdates(uri))
    await waitFor(() => expect(callsFor(uri)).toHaveLength(1))
    await resolveLatest(uri, [record(`${uri}#u1`, "2026-01-01T00:00:00Z")])
    a.unmount()

    // Tab-switch remount: data is served synchronously from the cache.
    const b = renderHook(() => useContextUpdates(uri))
    expect(b.result.current.updates.map((u) => u.uri)).toEqual([`${uri}#u1`])
    expect(b.result.current.isLoading).toBe(false)
    expect(callsFor(uri)).toHaveLength(1)
  })

  it("invalidateContextUpdates forces the next mount to re-fetch (create/edit save path)", async () => {
    const uri = subject("invalidate")
    const a = renderHook(() => useContextUpdates(uri))
    await waitFor(() => expect(callsFor(uri)).toHaveLength(1))
    await resolveLatest(uri, [record(`${uri}#u1`, "2026-01-01T00:00:00Z")])
    a.unmount()

    // The update form saved on its own route and invalidated the subject.
    invalidateContextUpdates(uri)

    const b = renderHook(() => useContextUpdates(uri))
    await waitFor(() => expect(callsFor(uri)).toHaveLength(2))
    await resolveLatest(uri, [
      record(`${uri}#u1`, "2026-01-01T00:00:00Z"),
      record(`${uri}#u-created`, "2026-03-01T00:00:00Z"),
    ])
    expect(b.result.current.updates.map((u) => u.uri)).toEqual([
      `${uri}#u-created`,
      `${uri}#u1`,
    ])
  })

  it("null and unparseable subjects never fetch", async () => {
    const a = renderHook(() => useContextUpdates(null))
    expect(a.result.current.updates).toEqual([])
    expect(a.result.current.isLoading).toBe(false)
    expect(a.result.current.error).toBeNull()

    const b = renderHook(() => useContextUpdates("not-an-at-uri"))
    await waitFor(() =>
      expect(b.result.current.isLoading).toBe(false),
    )
    expect(b.result.current.updates).toEqual([])
    expect(b.result.current.error).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("a failed fetch surfaces the error and is not cached — the next mount retries", async () => {
    const uri = subject("error")
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})
    try {
      const a = renderHook(() => useContextUpdates(uri))
      await waitFor(() => expect(callsFor(uri)).toHaveLength(1))
      await act(async () => {
        callsFor(uri)[0].reject(new Error("indexer down"))
      })
      expect(a.result.current.error).toBe("indexer down")
      a.unmount()

      const b = renderHook(() => useContextUpdates(uri))
      await waitFor(() => expect(callsFor(uri)).toHaveLength(2))
      await resolveLatest(uri, [record(`${uri}#u1`, "2026-01-01T00:00:00Z")])
      expect(b.result.current.error).toBeNull()
      expect(b.result.current.updates).toHaveLength(1)
    } finally {
      consoleError.mockRestore()
    }
  })
})
