import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import type {
  ActivityRecord,
  ListActivitiesResponse,
} from "@/lib/atproto/activity-types"

// Controllable mock of fetchActivities. Each call records its args and
// returns a deferred promise we resolve by hand so a test can interleave
// a profile switch between a fetch starting and resolving.
interface PendingCall {
  did: string
  cursor: string | undefined
  resolve: (value: ListActivitiesResponse) => void
}

const calls: PendingCall[] = []

vi.mock("@/lib/atproto/activity", () => ({
  fetchActivities: vi.fn(
    (did: string, cursor?: string) =>
      new Promise<ListActivitiesResponse>((resolve) => {
        calls.push({ did, cursor, resolve })
      }),
  ),
}))

import { useUserActivities } from "../use-user-activities"

function rec(uri: string): ActivityRecord {
  return {
    uri,
    cid: `cid-${uri}`,
    value: {
      title: uri,
      shortDescription: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  }
}

/** Resolve the oldest still-pending fetch matching the predicate. */
function resolveCall(
  match: (c: PendingCall) => boolean,
  value: ListActivitiesResponse,
) {
  const idx = calls.findIndex(match)
  if (idx === -1) throw new Error("no matching pending fetchActivities call")
  const [call] = calls.splice(idx, 1)
  call.resolve(value)
}

beforeEach(() => {
  cleanup()
  calls.length = 0
})

describe("useUserActivities — loadMore generation guard", () => {
  it("ignores an in-flight loadMore for the previous DID after a profile switch", async () => {
    const { result, rerender } = renderHook(({ did }) => useUserActivities(did), {
      initialProps: { did: "did:a" },
    })

    // Page 1 for DID A.
    await act(async () => {
      resolveCall((c) => c.did === "did:a" && c.cursor === undefined, {
        records: [rec("at://a/1"), rec("at://a/2")],
        cursor: "cursor-a-1",
      })
    })
    await waitFor(() => expect(result.current.activities).toHaveLength(2))

    // Kick off loadMore for A — fetch starts but does NOT resolve yet.
    act(() => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(calls.some((c) => c.did === "did:a" && c.cursor === "cursor-a-1")).toBe(true),
    )

    // Switch to DID B and let its page-1 land, resetting the list to B's rows.
    rerender({ did: "did:b" })
    await act(async () => {
      resolveCall((c) => c.did === "did:b" && c.cursor === undefined, {
        records: [rec("at://b/1")],
        cursor: "cursor-b-1",
      })
    })
    await waitFor(() =>
      expect(result.current.activities.map((r) => r.uri)).toEqual(["at://b/1"]),
    )

    // Now the stale loadMore for A resolves late. Its records must NOT be
    // appended to B's reset list.
    await act(async () => {
      resolveCall((c) => c.did === "did:a" && c.cursor === "cursor-a-1", {
        records: [rec("at://a/3"), rec("at://a/4")],
        cursor: "cursor-a-2",
      })
    })

    const uris = result.current.activities.map((r) => r.uri)
    expect(uris).toEqual(["at://b/1"])
    expect(uris).not.toContain("at://a/3")
    expect(uris).not.toContain("at://a/4")
  })

  it("dedups appended records by uri on loadMore", async () => {
    const { result } = renderHook(() => useUserActivities("did:a"))

    await act(async () => {
      resolveCall((c) => c.did === "did:a" && c.cursor === undefined, {
        records: [rec("at://a/1"), rec("at://a/2")],
        cursor: "cursor-a-1",
      })
    })
    await waitFor(() => expect(result.current.activities).toHaveLength(2))

    act(() => {
      result.current.loadMore()
    })
    await waitFor(() =>
      expect(calls.some((c) => c.did === "did:a" && c.cursor === "cursor-a-1")).toBe(true),
    )

    // Page 2 overlaps page 1 (at://a/2 repeats across the cursor boundary).
    await act(async () => {
      resolveCall((c) => c.did === "did:a" && c.cursor === "cursor-a-1", {
        records: [rec("at://a/2"), rec("at://a/3")],
        cursor: null as unknown as undefined,
      })
    })

    const uris = result.current.activities.map((r) => r.uri)
    expect(uris).toEqual(["at://a/1", "at://a/2", "at://a/3"])
  })
})
