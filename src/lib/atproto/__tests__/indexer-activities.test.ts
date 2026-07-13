import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  fetchIndexerActivities,
  fetchIndexerActivitiesByUris,
} from "../indexer"

/**
 * Error-policy contract for the activity fetchers.
 *
 * HTTP-level failures must THROW — even when the body carries a
 * GraphQL `errors` array (per graphql-over-http, request errors come
 * back as 400/500 WITH an errors body, and the proxy forwards the
 * upstream status verbatim). Treating those as an empty feed would
 * silently mask real defects as "no results".
 *
 * A 200 whose connection is missing but whose body carries GraphQL
 * errors is genuine partial data — that path stays fail-soft (warn +
 * empty page).
 */

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  globalThis.fetch = originalFetch
  warnSpy.mockRestore()
})

function respondWith(body: unknown, status = 200): void {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const activityNode = {
  uri: "at://did:plc:author/org.hypercerts.claim.activity/abc",
  cid: "bafyactivity",
  did: "did:plc:author",
  title: "Planted trees",
  shortDescription: "desc",
  createdAt: "2026-01-01T00:00:00Z",
  startDate: null,
  endDate: null,
  labels: ["gold"],
  image: null,
  workScope: null,
}

describe("fetchIndexerActivities error policy", () => {
  it("throws on a non-2xx response even when the body carries GraphQL errors", async () => {
    respondWith(
      { errors: [{ message: "unknown argument 'authorLabels'" }] },
      400,
    )

    await expect(fetchIndexerActivities({ first: 20 })).rejects.toThrow(
      "Indexer request failed: 400: unknown argument 'authorLabels'",
    )
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("throws on a non-2xx response without an errors body", async () => {
    respondWith({ error: "Indexer request failed" }, 502)

    await expect(fetchIndexerActivities()).rejects.toThrow(
      "Indexer request failed: 502",
    )
  })

  it("fails soft (warn + empty page) on a 200 with GraphQL errors and no connection", async () => {
    respondWith({
      data: { orgHypercertsClaimActivity: null },
      errors: [{ message: "partial data" }],
    })

    const result = await fetchIndexerActivities()

    expect(result.records).toEqual([])
    expect(result.hasMore).toBe(false)
    expect(result.totalCount).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      "[Indexer] GraphQL error, returning empty page:",
      "partial data",
    )
  })

  it("maps records, dids, and labels on a clean 200", async () => {
    respondWith({
      data: {
        orgHypercertsClaimActivity: {
          totalCount: 1,
          edges: [{ cursor: "c1", node: activityNode }],
          pageInfo: { hasNextPage: false, endCursor: "c1" },
        },
      },
    })

    const result = await fetchIndexerActivities()

    expect(result.records).toHaveLength(1)
    expect(result.records[0].uri).toBe(activityNode.uri)
    expect(result.dids.get(activityNode.uri)).toBe("did:plc:author")
    expect(result.labels.get(activityNode.uri)).toEqual(["gold"])
    expect(result.totalCount).toBe(1)
  })
})

describe("fetchIndexerActivitiesByUris error policy", () => {
  it("throws on a non-2xx response even when the body carries GraphQL errors", async () => {
    respondWith({ errors: [{ message: "in list must contain 1 to 50 values" }] }, 400)

    await expect(
      fetchIndexerActivitiesByUris([activityNode.uri]),
    ).rejects.toThrow(
      "Indexer request failed: 400: in list must contain 1 to 50 values",
    )
  })

  it("fails soft (warn + empty) on a 200 with GraphQL errors and no connection", async () => {
    respondWith({
      data: {},
      errors: [{ message: "partial data" }],
    })

    const result = await fetchIndexerActivitiesByUris([activityNode.uri])

    expect(result.records).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      "[Indexer] ActivitiesByUris error:",
      "partial data",
    )
  })
})
