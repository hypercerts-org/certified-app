import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"
import type { IndexerActivitiesResult } from "@/lib/atproto/indexer"

/**
 * Tests for the indexer-render degradation in `useActivity` (#184). When
 * the live PDS getRecord fails (host down/unreachable, or a 404 on a stale
 * home), the hook falls back to the indexer — which keeps the record under
 * its DID-based AT-URI — and flags the result `partial`. A genuinely-gone
 * record (PDS miss AND indexer miss) still surfaces the original error.
 *
 * authFetch (the PDS proxy hop) and fetchIndexerActivitiesByUris are
 * mocked. Each test uses a unique did/rkey so the hook's module-level
 * cache doesn't bleed between cases.
 */

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...a: unknown[]) => authFetch(...a),
}))

const fetchIndexerActivitiesByUris = vi.fn()
vi.mock("@/lib/atproto/indexer", () => ({
  fetchIndexerActivitiesByUris: (...a: unknown[]) =>
    fetchIndexerActivitiesByUris(...a),
}))

import { useActivity } from "../use-activity"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function indexerResult(uri: string, cid: string, title: string): IndexerActivitiesResult {
  return {
    records: [
      {
        uri,
        cid,
        value: {
          title,
          shortDescription: "",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ],
    dids: new Map([[uri, uri.split("/")[2]]]),
    labels: new Map(),
    hasMore: false,
    endCursor: null,
    totalCount: 1,
  }
}

const emptyIndexerResult: IndexerActivitiesResult = {
  records: [],
  dids: new Map(),
  labels: new Map(),
  hasMore: false,
  endCursor: null,
  totalCount: 0,
}

beforeEach(() => {
  cleanup()
  authFetch.mockReset()
  fetchIndexerActivitiesByUris.mockReset()
})

describe("useActivity — indexer fallback (#184)", () => {
  it("falls back to the indexer and flags `partial` when the PDS read 404s", async () => {
    const did = "did:plc:partialcase00000000000a"
    const rkey = "rkeyA"
    const uri = `at://${did}/org.hypercerts.claim.activity/${rkey}`

    authFetch.mockResolvedValue(new Response("", { status: 404 }))
    fetchIndexerActivitiesByUris.mockResolvedValue(
      indexerResult(uri, "cid-A", "Recovered Activity"),
    )

    const { result } = renderHook(() => useActivity(did, rkey))

    await waitFor(() => expect(result.current.activity).not.toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.activity?.partial).toBe(true)
    expect(result.current.activity?.value.title).toBe("Recovered Activity")
    expect(result.current.activity?.uri).toBe(uri)
    expect(fetchIndexerActivitiesByUris).toHaveBeenCalledWith([uri])
  })

  it("surfaces the original error when both the PDS and the indexer miss", async () => {
    const did = "did:plc:bothmisscase0000000000a"
    const rkey = "rkeyB"

    authFetch.mockResolvedValue(new Response("", { status: 404 }))
    fetchIndexerActivitiesByUris.mockResolvedValue(emptyIndexerResult)

    const { result } = renderHook(() => useActivity(did, rkey))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.activity).toBeNull()
    expect(result.current.error).toBe("Activity not found")
  })

  it("does not cache a partial — a later mount re-attempts the PDS and heals", async () => {
    const did = "did:plc:healcase00000000000a"
    const rkey = "rkeyD"
    const uri = `at://${did}/org.hypercerts.claim.activity/${rkey}`

    // First mount: PDS down -> indexer partial.
    authFetch.mockResolvedValue(new Response("", { status: 404 }))
    fetchIndexerActivitiesByUris.mockResolvedValue(
      indexerResult(uri, "cid-D", "Partial Title"),
    )

    const first = renderHook(() => useActivity(did, rkey))
    await waitFor(() => expect(first.result.current.activity?.partial).toBe(true))
    first.unmount()

    // PDS recovers.
    authFetch.mockResolvedValue(
      jsonResponse({
        uri,
        cid: "cid-D",
        value: {
          title: "Full Title",
          shortDescription: "",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    )
    const callsBefore = authFetch.mock.calls.length

    // Second mount: the partial was not cached, so the PDS is re-attempted
    // and the full (non-partial) record replaces the degraded one.
    const second = renderHook(() => useActivity(did, rkey))
    await waitFor(() =>
      expect(second.result.current.activity?.value.title).toBe("Full Title"),
    )
    expect(second.result.current.activity?.partial).toBeFalsy()
    expect(authFetch.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it("uses the PDS record and never calls the indexer on success", async () => {
    const did = "did:plc:happycase000000000000a"
    const rkey = "rkeyC"
    const uri = `at://${did}/org.hypercerts.claim.activity/${rkey}`

    authFetch.mockResolvedValue(
      jsonResponse({
        uri,
        cid: "cid-C",
        value: {
          title: "Live Activity",
          shortDescription: "",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    )

    const { result } = renderHook(() => useActivity(did, rkey))

    await waitFor(() => expect(result.current.activity).not.toBeNull())
    expect(result.current.activity?.value.title).toBe("Live Activity")
    expect(result.current.activity?.partial).toBeFalsy()
    expect(fetchIndexerActivitiesByUris).not.toHaveBeenCalled()
  })
})
