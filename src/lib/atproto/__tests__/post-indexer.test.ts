import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { postIndexer, INDEXER_PROXY_URL } from "../indexer"

/**
 * Contract tests for the shared indexer-proxy POST helper. The whole
 * point of `postIndexer` is that it never throws on HTTP !ok or on
 * GraphQL errors (callers apply their own policy), parses the body
 * defensively, and still rejects on abort so cancellation flows work.
 */

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function respondWith(body: unknown, status = 200): void {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

describe("postIndexer", () => {
  it("returns parsed data with empty errors on a 200 with data", async () => {
    respondWith({ data: { thing: { totalCount: 7 } } })

    const result = await postIndexer<{ thing: { totalCount: number } }>(
      "ThingCount",
      {},
    )

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ thing: { totalCount: 7 } })
    expect(result.errors).toEqual([])
  })

  it("surfaces the GraphQL errors array (with extensions.code) on a 200", async () => {
    respondWith({
      data: null,
      errors: [
        {
          message: "endorsement graph warming",
          extensions: { code: "ENDORSEMENT_GRAPH_WARMING" },
        },
        { message: "second error" },
      ],
    })

    const result = await postIndexer("EndorsementClosure", {
      viewer: "did:plc:abc",
    })

    expect(result.ok).toBe(true)
    expect(result.data).toBeNull()
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0].message).toBe("endorsement graph warming")
    expect(result.errors[0].extensions?.code).toBe("ENDORSEMENT_GRAPH_WARMING")
    expect(result.errors[1]).toEqual({ message: "second error" })
  })

  it("does not throw on HTTP 500 with a JSON error body", async () => {
    respondWith({ errors: [{ message: "internal error" }] }, 500)

    const result = await postIndexer("Activities", { first: 20 })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.data).toBeNull()
    expect(result.errors).toEqual([{ message: "internal error" }])
  })

  it("does not throw on HTTP 502 with a non-JSON body (guarded parse)", async () => {
    mockFetch.mockResolvedValue(
      new Response("<html>Bad Gateway</html>", { status: 502 }),
    )

    const result = await postIndexer("Activities", { first: 20 })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(502)
    expect(result.data).toBeNull()
    expect(result.errors).toEqual([])
  })

  it("propagates an abort as a rejection", async () => {
    mockFetch.mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    )
    const controller = new AbortController()
    controller.abort()

    await expect(
      postIndexer("Activities", { first: 20 }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("sends the canonical request shape to the proxy", async () => {
    respondWith({ data: {} })
    const controller = new AbortController()

    await postIndexer(
      "AuthoredActivities",
      { did: "did:plc:abc", first: 20 },
      { signal: controller.signal },
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(INDEXER_PROXY_URL)
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(init.signal).toBe(controller.signal)
    expect(JSON.parse(init.body as string)).toEqual({
      operationName: "AuthoredActivities",
      variables: { did: "did:plc:abc", first: 20 },
    })
  })
})
