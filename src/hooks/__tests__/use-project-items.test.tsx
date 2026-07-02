import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"
import type { IndexerActivitiesResult } from "@/lib/atproto/indexer"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/**
 * Tests for the batched resolution in `useProjectItems`
 * (nplus1-project-items-getrecord). The hook resolves a project's
 * `items[]` strong-refs through the indexer's batch-by-URI query and
 * only falls back to the per-URI PDS getRecord for URIs the indexer
 * doesn't return (not-yet-indexed / cross-PDS records).
 *
 * `authFetch` (the PDS proxy hop) and `fetchIndexerActivitiesByUris`
 * are mocked; `parseAtUri` runs for real so the URIs must be valid.
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

import { useProjectItems } from "../use-project-items"

const COLLECTION = "org.hypercerts.claim.activity"

function uriFor(did: string, rkey: string): string {
  return `at://${did}/${COLLECTION}/${rkey}`
}

function itemsFor(...uris: string[]) {
  return uris.map((uri) => ({ itemIdentifier: { uri, cid: `cid-${uri}` } }))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function activityRecord(uri: string, cid: string, title: string): ActivityRecord {
  return {
    uri,
    cid,
    value: { title, shortDescription: "", createdAt: "2026-01-01T00:00:00.000Z" },
  }
}

function indexerResult(records: ActivityRecord[]): IndexerActivitiesResult {
  return {
    records,
    dids: new Map(records.map((r) => [r.uri, r.uri.split("/")[2]])),
    labels: new Map(),
    hasMore: false,
    endCursor: null,
    totalCount: records.length,
  }
}

beforeEach(() => {
  cleanup()
  authFetch.mockReset()
  fetchIndexerActivitiesByUris.mockReset()
})

describe("useProjectItems — batched indexer resolution", () => {
  it("resolves every item in one indexer batch and never hits the PDS", async () => {
    const did1 = "did:plc:projitemsaaaaaaaaaaaa1"
    const did2 = "did:plc:projitemsaaaaaaaaaaaa2"
    const uri1 = uriFor(did1, "one")
    const uri2 = uriFor(did2, "two")

    fetchIndexerActivitiesByUris.mockResolvedValue(
      indexerResult([
        activityRecord(uri1, "cid-1", "One"),
        activityRecord(uri2, "cid-2", "Two"),
      ]),
    )

    const { result } = renderHook(() => useProjectItems(itemsFor(uri1, uri2)))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.resolutions).toHaveLength(2)
    expect(result.current.resolutions[0].uri).toBe(uri1)
    expect(result.current.resolutions[0].did).toBe(did1)
    expect(result.current.resolutions[0].record?.value.title).toBe("One")
    expect(result.current.resolutions[1].uri).toBe(uri2)
    expect(result.current.resolutions[1].record?.value.title).toBe("Two")
    expect(result.current.resolutions.every((r) => r.error === null)).toBe(true)

    expect(fetchIndexerActivitiesByUris).toHaveBeenCalledTimes(1)
    expect(authFetch).not.toHaveBeenCalled()
  })

  it("falls back to getRecord only for URIs the indexer doesn't return", async () => {
    const did1 = "did:plc:projitemsbbbbbbbbbbbb1"
    const did2 = "did:plc:projitemsbbbbbbbbbbbb2"
    const uri1 = uriFor(did1, "indexed")
    const uri2 = uriFor(did2, "notyetindexed")

    // Indexer only knows about uri1.
    fetchIndexerActivitiesByUris.mockResolvedValue(
      indexerResult([activityRecord(uri1, "cid-1", "Indexed")]),
    )
    authFetch.mockResolvedValue(
      jsonResponse({
        uri: uri2,
        cid: "cid-2",
        value: {
          title: "From PDS",
          shortDescription: "",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    )

    const { result } = renderHook(() => useProjectItems(itemsFor(uri1, uri2)))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.resolutions[0].record?.value.title).toBe("Indexed")
    expect(result.current.resolutions[1].record?.value.title).toBe("From PDS")

    // Exactly one PDS fallback, for the missing URI only.
    expect(authFetch).toHaveBeenCalledTimes(1)
    const calledUrl = authFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain("rkey=notyetindexed")
    expect(calledUrl).toContain(`repo=${encodeURIComponent(did2)}`)
  })

  it("falls back to getRecord for every URI when the indexer batch throws", async () => {
    const did1 = "did:plc:projitemsccccccccccccc1"
    const did2 = "did:plc:projitemsccccccccccccc2"
    const uri1 = uriFor(did1, "alpha")
    const uri2 = uriFor(did2, "beta")

    fetchIndexerActivitiesByUris.mockRejectedValue(new Error("indexer down"))
    authFetch.mockImplementation((url: string) => {
      const uri = url.includes("rkey=alpha") ? uri1 : uri2
      const title = url.includes("rkey=alpha") ? "Alpha" : "Beta"
      return Promise.resolve(
        jsonResponse({
          uri,
          cid: `cid-${uri}`,
          value: {
            title,
            shortDescription: "",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      )
    })

    const { result } = renderHook(() => useProjectItems(itemsFor(uri1, uri2)))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.resolutions[0].record?.value.title).toBe("Alpha")
    expect(result.current.resolutions[1].record?.value.title).toBe("Beta")
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("surfaces a per-item error when a fallback getRecord 404s", async () => {
    const did1 = "did:plc:projitemsdddddddddddd1"
    const did2 = "did:plc:projitemsdddddddddddd2"
    const uri1 = uriFor(did1, "present")
    const uri2 = uriFor(did2, "gone")

    // Indexer knows nothing; both fall back to the PDS.
    fetchIndexerActivitiesByUris.mockResolvedValue(indexerResult([]))
    authFetch.mockImplementation((url: string) => {
      if (url.includes("rkey=gone")) {
        return Promise.resolve(new Response("", { status: 404 }))
      }
      return Promise.resolve(
        jsonResponse({
          uri: uri1,
          cid: "cid-1",
          value: {
            title: "Present",
            shortDescription: "",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      )
    })

    const { result } = renderHook(() => useProjectItems(itemsFor(uri1, uri2)))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.resolutions[0].record?.value.title).toBe("Present")
    expect(result.current.resolutions[0].error).toBeNull()
    expect(result.current.resolutions[1].record).toBeNull()
    expect(result.current.resolutions[1].error).toBe("Activity not found")
  })

  it("ignores non-activity item URIs (only cert cards resolve)", async () => {
    const did = "did:plc:projitemseeeeeeeeeeee1"
    const activityUri = uriFor(did, "cert")
    const collectionUri = `at://${did}/org.hypercerts.collection/nested`

    fetchIndexerActivitiesByUris.mockResolvedValue(
      indexerResult([activityRecord(activityUri, "cid-1", "Cert")]),
    )

    const { result } = renderHook(() =>
      useProjectItems(itemsFor(activityUri, collectionUri)),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.resolutions).toHaveLength(1)
    expect(result.current.resolutions[0].uri).toBe(activityUri)
    expect(fetchIndexerActivitiesByUris).toHaveBeenCalledWith([activityUri], {
      signal: expect.any(AbortSignal),
    })
  })
})
