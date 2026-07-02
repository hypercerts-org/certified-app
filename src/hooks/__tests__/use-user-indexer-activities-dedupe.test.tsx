import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { IndexerActivitiesResult } from "@/lib/atproto/indexer"

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

function result(
  records: ActivityRecord[],
  endCursor: string | null,
  hasMore: boolean,
): IndexerActivitiesResult {
  return {
    records,
    dids: new Map(),
    labels: new Map(),
    hasMore,
    endCursor,
    totalCount: null,
  }
}

vi.mock("@/lib/atproto/indexer", () => ({
  fetchUserIndexerActivities: vi.fn(
    async (
      _did: string,
      opts: { mode: "authored" | "contributed"; after?: string },
    ) => {
      if (opts.mode === "authored") {
        if (!opts.after)
          return result([rec("at://x/a1"), rec("at://x/a2")], "a-cur", true)
        if (opts.after === "a-cur")
          // Page 2 overlaps page 1 (a2 repeats across the cursor boundary).
          return result([rec("at://x/a2"), rec("at://x/a3")], null, false)
      }
      // contributed bucket — single page, no more.
      return result([rec("at://x/c1")], null, false)
    },
  ),
  fetchIndexerActivities: vi.fn(async () => result([], null, false)),
}))

import { useUserIndexerActivities } from "../use-user-indexer-activities"

beforeEach(() => {
  cleanup()
})

describe("useUserIndexerActivities — loadMore dedupe", () => {
  it("dedupes appended records by uri across a cursor boundary", async () => {
    const { result: hook } = renderHook(() =>
      useUserIndexerActivities("did:x"),
    )

    await waitFor(() => expect(hook.current.created).toHaveLength(2))
    expect(hook.current.created.map((r) => r.uri)).toEqual([
      "at://x/a1",
      "at://x/a2",
    ])

    await act(async () => {
      await hook.current.loadMore()
    })

    // a2 must not be duplicated — dedupe keeps the first occurrence.
    expect(hook.current.created.map((r) => r.uri)).toEqual([
      "at://x/a1",
      "at://x/a2",
      "at://x/a3",
    ])
  })
})
