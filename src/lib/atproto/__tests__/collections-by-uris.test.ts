import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchIndexerProjectsByUris, INDEXER_PROXY_URL } from "../indexer"

/**
 * Contract tests for the `CollectionsByUris` batch fetcher backing the
 * explore page's Ma Earth featured Projects filter. The fetcher must
 * (a) map indexer collection nodes to the exact `CollectionRecord`
 * shape the other collections fetchers produce (banner / avatar union
 * re-shaping, `map[$link:…]` blob-ref stripping, items strongRefs),
 * (b) report HTTP / GraphQL failures via `ok: false` WITHOUT throwing
 * (the loader falls back to the per-URI PDS path — the deployed
 * indexer may not support `uri: { in }` on `orgHypercertsCollection`
 * yet), and (c) chunk large URI sets at the proxy's 50-URI cap.
 */

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function respondWith(body: unknown, status = 200): void {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const NODE_A = {
  uri: "at://did:plc:alice/org.hypercerts.collection/p1",
  cid: "cid-a",
  did: "did:plc:alice",
  createdAt: "2026-01-01T00:00:00.000Z",
  title: "Forest restoration",
  shortDescription: "Replanting native trees",
  type: "project",
  items: [
    {
      itemIdentifier: {
        uri: "at://did:plc:alice/org.hypercerts.claim.activity/a1",
        cid: "cid-item",
      },
    },
    // Malformed strongRef (no cid) — dropped by the mapper.
    { itemIdentifier: { uri: "at://did:plc:alice/x/y" } },
  ],
  avatar: {
    __typename: "OrgHypercertsDefsSmallImage",
    image: { ref: "map[$link:bafyavatarcid]", mimeType: "image/png" },
  },
  banner: {
    __typename: "OrgHypercertsDefsUri",
    uri: "https://example.com/banner.png",
  },
}

const NODE_B = {
  uri: "at://did:plc:bob/org.hypercerts.collection/p2",
  cid: "cid-b",
  did: "did:plc:bob",
  createdAt: null,
  title: null,
  shortDescription: null,
  type: "project",
  items: null,
  avatar: null,
  banner: null,
}

function connectionOf(nodes: unknown[]): unknown {
  return {
    data: {
      orgHypercertsCollection: {
        edges: nodes.map((node) => ({ node })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  }
}

describe("fetchIndexerProjectsByUris", () => {
  it("maps nodes to the shared CollectionRecord shape (ok: true)", async () => {
    respondWith(connectionOf([NODE_A, NODE_B]))

    const result = await fetchIndexerProjectsByUris([NODE_A.uri, NODE_B.uri])

    expect(result.ok).toBe(true)
    expect(result.records).toEqual([
      {
        uri: NODE_A.uri,
        cid: "cid-a",
        value: {
          type: "project",
          title: "Forest restoration",
          shortDescription: "Replanting native trees",
          createdAt: "2026-01-01T00:00:00.000Z",
          // SmallImage union member re-shaped to the loose blob form,
          // with the indexer's map[$link:…] wrapper stripped.
          avatar: { image: { ref: "bafyavatarcid", mimeType: "image/png" } },
          // Uri union member collapses to { uri }.
          banner: { uri: "https://example.com/banner.png" },
          items: [
            {
              itemIdentifier: {
                uri: "at://did:plc:alice/org.hypercerts.claim.activity/a1",
                cid: "cid-item",
              },
            },
          ],
        },
      },
      // Sparse node: only the discriminator + empty items survive.
      { uri: NODE_B.uri, cid: "cid-b", value: { type: "project", items: [] } },
    ])

    // Single chunk → single POST with the canonical envelope.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(INDEXER_PROXY_URL)
    expect(JSON.parse(init.body as string)).toEqual({
      operationName: "CollectionsByUris",
      variables: { uris: [NODE_A.uri, NODE_B.uri] },
    })
  })

  it("returns ok: false on GraphQL errors without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    respondWith({
      data: null,
      errors: [{ message: 'Unknown argument "where"' }],
    })

    const result = await fetchIndexerProjectsByUris([NODE_A.uri])

    expect(result).toEqual({ records: [], ok: false })
    expect(warn).toHaveBeenCalledWith(
      "[Indexer] CollectionsByUris error:",
      'Unknown argument "where"',
    )
  })

  it("returns ok: false on an HTTP error without throwing", async () => {
    mockFetch.mockResolvedValue(
      new Response("<html>Bad Gateway</html>", { status: 502 }),
    )

    const result = await fetchIndexerProjectsByUris([NODE_A.uri])

    expect(result).toEqual({ records: [], ok: false })
  })

  it("short-circuits an empty URI list without a network call", async () => {
    const result = await fetchIndexerProjectsByUris([])

    expect(result).toEqual({ records: [], ok: true })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("chunks past 50 URIs and merges + dedupes the results", async () => {
    const uris = Array.from({ length: 60 }, (_, i) =>
      i === 59
        ? NODE_A.uri // duplicate of chunk 1's node A → deduped
        : `at://did:plc:alice/org.hypercerts.collection/p${i}`,
    )
    uris[0] = NODE_A.uri
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(connectionOf([NODE_A])), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(connectionOf([NODE_B, NODE_A])), {
          status: 200,
        }),
      )

    const result = await fetchIndexerProjectsByUris(uris)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    ) as { variables: { uris: string[] } }
    const secondBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string,
    ) as { variables: { uris: string[] } }
    expect(firstBody.variables.uris).toHaveLength(50)
    expect(secondBody.variables.uris).toHaveLength(10)
    expect(result.ok).toBe(true)
    expect(result.records.map((r) => r.uri)).toEqual([NODE_A.uri, NODE_B.uri])
  })

  it("marks ok: false when one chunk fails but still returns the good chunk's records", async () => {
    const uris = Array.from(
      { length: 60 },
      (_, i) => `at://did:plc:alice/org.hypercerts.collection/p${i}`,
    )
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(connectionOf([NODE_A])), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("oops", { status: 500 }))

    const result = await fetchIndexerProjectsByUris(uris)

    expect(result.ok).toBe(false)
    expect(result.records.map((r) => r.uri)).toEqual([NODE_A.uri])
  })
})
