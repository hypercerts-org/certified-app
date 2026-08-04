import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  certifiedFeedImageUrl,
  CertifiedFeedError,
  fetchCertifiedFeed,
  parseCertifiedFeedResponse,
  parseCertifiedFeedServiceOrigin,
  parseHomeFeedSource,
} from "../certified-feed"

const did = "did:plc:abcdefghijklmnopqrstuvwx"
const subjectDid = "did:plc:zyxwvutsrqponmlkjihgfedc"
const uri = `at://${did}/org.hypercerts.claim.activity/3abc`
const cid = "bafyreia3tbsfxe3cc75xrxyyn6qc42oupi73fxiox76prlyi5bpx7hr72u"
const timestamp = "2026-07-21T10:00:00.000Z"

function actor(actorDid = did) {
  return { did: actorDid, handle: "actor.example", displayName: "Actor" }
}

function item(kind: string, content: Record<string, unknown>) {
  return {
    subject: uri,
    view: {
      $type: "app.certified.feed.beta.defs#certifiedFeedView",
      kind,
      actor: actor(),
      content,
    },
  }
}

const knownViews = [
  [
    "cert.create",
    {
      $type: "app.certified.feed.beta.defs#activityView",
      title: "Restore",
      locationCount: 2,
    },
  ],
  [
    "collection.create",
    {
      $type: "app.certified.feed.beta.defs#collectionView",
      title: "Program",
      itemCount: 3,
    },
  ],
  [
    "project.created_with_cert",
    {
      $type: "app.certified.feed.beta.defs#collectionView",
      title: "Paired program",
      itemCount: 1,
    },
  ],
  [
    "endorsement.award",
    {
      $type: "app.certified.feed.beta.defs#endorsementView",
      subject: actor(subjectDid),
    },
  ],
  [
    "evaluation.create",
    { $type: "app.certified.feed.beta.defs#evaluationView", summary: "Strong" },
  ],
  [
    "measurement.create",
    { $type: "app.certified.feed.beta.defs#measurementView", metric: "hectares" },
  ],
  [
    "hyperboard.create",
    { $type: "app.certified.feed.beta.defs#hyperboardView" },
  ],
  [
    "update.create",
    {
      $type: "app.certified.feed.beta.defs#updateView",
      title: "Progress",
      image: {
        $type: "org.hypercerts.defs#smallBlob",
        blob: {
          $type: "blob",
          ref: { $link: cid },
          mimeType: "image/png",
          size: 123,
        },
      },
    },
  ],
] as const

describe("feed configuration", () => {
  it("defaults the source to indexer and accepts only known values", () => {
    expect(parseHomeFeedSource(undefined)).toBe("indexer")
    expect(parseHomeFeedSource("service")).toBe("service")
    expect(() => parseHomeFeedSource("other")).toThrow(/use "indexer".*"service"/)
  })

  it("accepts HTTPS origins and non-production loopback HTTP", () => {
    expect(parseCertifiedFeedServiceOrigin("https://feed.example", "production")).toBe(
      "https://feed.example",
    )
    expect(parseCertifiedFeedServiceOrigin("http://127.0.0.1:3001", "development")).toBe(
      "http://127.0.0.1:3001",
    )
  })

  it.each([
    "https://user:secret@feed.example",
    "https://feed.example/xrpc",
    "https://feed.example?x=1",
    "https://feed.example#fragment",
    "ftp://feed.example",
    "http://feed.example",
  ])("rejects a non-origin or unsafe service URL: %s", (value) => {
    expect(() => parseCertifiedFeedServiceOrigin(value, "production")).toThrow()
  })
})

describe("parseCertifiedFeedResponse", () => {
  it.each(knownViews)("parses %s", (kind, content) => {
    const page = parseCertifiedFeedResponse({ feed: [item(kind, content)], cursor: "next" })
    expect(page.items[0]).toMatchObject({
      subject: uri,
      view: { kind, content: { $type: content.$type } },
    })
    expect(page.cursor).toBe("next")
  })

  it("derives a missing event actor DID from the source AT URI", () => {
    const value = item("cert.create", knownViews[0][1])
    value.view.actor = { handle: "actor.example", displayName: "Actor" }
    expect(parseCertifiedFeedResponse({ feed: [value] }).items[0].view.actor.did).toBe(did)
  })

  it("rejects an explicit event actor DID that disagrees with source ownership", () => {
    const value = item("cert.create", knownViews[0][1])
    value.view.actor = actor(subjectDid)
    expect(() => parseCertifiedFeedResponse({ feed: [value] })).toThrow(
      /must match the source AT-URI authority/,
    )
  })

  it("uses the validated event actor DID as actor-avatar blob owner", () => {
    const value = item("cert.create", knownViews[0][1])
    value.view.actor = {
      ...actor(),
      avatar: {
        $type: "org.hypercerts.defs#smallImage",
        image: {
          $type: "blob",
          ref: { $link: cid },
          mimeType: "image/png",
          size: 123,
        },
      },
    }
    const parsed = parseCertifiedFeedResponse({ feed: [value] }).items[0]
    expect(certifiedFeedImageUrl(parsed.view.actor.avatar, parsed.view.actor.did)).toBe(
      `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`,
    )
  })

  it("keeps unknown content as an open-union fallback", () => {
    const page = parseCertifiedFeedResponse({
      feed: [item("future.create", { $type: "app.certified.feed.beta.defs#futureView" })],
    })
    expect(page.items[0].view.content).toEqual({
      $type: "app.certified.feed.beta.defs#futureView",
      unknown: true,
    })
  })

  it("rejects known kind/content mismatches and malformed known content", () => {
    expect(() =>
      parseCertifiedFeedResponse({ feed: [item("cert.create", knownViews[1][1])] }),
    ).toThrow(/requires content/)
    expect(() =>
      parseCertifiedFeedResponse({
        feed: [
          item("cert.create", {
            $type: "app.certified.feed.beta.defs#activityView",
            title: "Missing count",
          }),
        ],
      }),
    ).toThrow(/locationCount/)
  })

  it("uses contextual blob variants and rejects a known variant in the wrong content", () => {
    const parsed = parseCertifiedFeedResponse({ feed: [item("update.create", knownViews[7][1])] })
    expect(parsed.items[0].view.content).toMatchObject({ image: { kind: "blob", cid } })
    expect(() =>
      parseCertifiedFeedResponse({
        feed: [
          item("cert.create", {
            $type: "app.certified.feed.beta.defs#activityView",
            title: "Bad image",
            locationCount: 0,
            image: knownViews[7][1].image,
          }),
        ],
      }),
    ).toThrow(/does not allow/)
  })

  it.each(["", "x".repeat(4097)])("rejects invalid cursors", (cursor) => {
    expect(() => parseCertifiedFeedResponse({ feed: [], cursor })).toThrow(/cursor/)
  })

  it("accepts calendar-valid fractional content dates with an offset", () => {
    const value = item("cert.create", {
      ...knownViews[0][1],
      createdAt: "2024-02-29T23:59:59.123456789+05:30",
    })
    expect(parseCertifiedFeedResponse({ feed: [value] }).items[0].view.content).toMatchObject({
      createdAt: "2024-02-29T23:59:59.123456789+05:30",
    })
  })

  it.each([
    "2026-07-21 10:00:00Z",
    "2026-07-21",
    "July 21, 2026 10:00:00 UTC",
    "2026-02-30T10:00:00Z",
    "2025-02-29T10:00:00Z",
    "2026-07-21T24:00:00Z",
    "2026-07-21T10:60:00Z",
    "2026-07-21T10:00:00+24:00",
  ])("rejects non-RFC3339 content dates: %s", (createdAt) => {
    const value = item("cert.create", { ...knownViews[0][1], createdAt })
    expect(() => parseCertifiedFeedResponse({ feed: [value] })).toThrow(/RFC3339/)
  })

  it.each([
    ["handle", "not-a-handle"],
    ["handle", "-bad.example"],
    ["handle", "bad_.example"],
  ])("rejects malformed actor %s %s", (_field, handle) => {
    const value = item("cert.create", knownViews[0][1])
    value.view.actor = { ...actor(), handle }
    expect(() => parseCertifiedFeedResponse({ feed: [value] })).toThrow(
      /valid AT Protocol handle/,
    )
  })

  it("rejects malformed generic image URIs", () => {
    expect(() =>
      parseCertifiedFeedResponse({
        feed: [
          item("cert.create", {
            $type: "app.certified.feed.beta.defs#activityView",
            title: "Bad URI",
            locationCount: 0,
            image: {
              $type: "org.hypercerts.defs#uri",
              uri: "not an absolute uri",
            },
          }),
        ],
      }),
    ).toThrow(/valid absolute URI/)
  })

  it("rejects malformed source, target, and blob CIDs", () => {
    const badSource = item("cert.create", knownViews[0][1])
    badSource.subject = "not-an-at-uri"
    expect(() => parseCertifiedFeedResponse({ feed: [badSource] })).toThrow(
      /at:\/\/ URI/,
    )

    expect(() =>
      parseCertifiedFeedResponse({
        feed: [
          item("evaluation.create", {
            $type: "app.certified.feed.beta.defs#evaluationView",
            target: { uri, cid: "bad-target" },
          }),
        ],
      }),
    ).toThrow(/valid CID/)

    const badBlob = structuredClone(knownViews[7][1]) as Record<string, unknown>
    ;(
      (badBlob.image as { blob: { ref: { $link: string } } }).blob.ref
    ).$link = "bad-blob"
    expect(() =>
      parseCertifiedFeedResponse({
        feed: [item("update.create", badBlob)],
      }),
    ).toThrow(/valid CID/)
  })
})

describe("fetchCertifiedFeed", () => {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch
    mockFetch.mockReset()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  async function fetchRateLimitError(retryAfter: string): Promise<CertifiedFeedError> {
    mockFetch.mockResolvedValueOnce(
      new Response("busy", {
        status: 429,
        headers: { "Retry-After": retryAfter },
      }),
    )
    try {
      await fetchCertifiedFeed(
        { viewerDid: did },
        { origin: "https://feed.example" },
      )
      throw new Error("Expected the feed request to be rate limited")
    } catch (error) {
      expect(error).toBeInstanceOf(CertifiedFeedError)
      return error as CertifiedFeedError
    }
  }

  it("sends one credentialless no-store XRPC POST", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ feed: [item("cert.create", knownViews[0][1])] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await fetchCertifiedFeed(
      { viewerDid: did, trustedEvaluators: [subjectDid], limit: 50 },
      { origin: "https://feed.example" },
    )
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://feed.example/xrpc/app.certified.feed.beta.getFeed",
    )
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
    })
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      feedId: "app.certified.feed.beta.defs#certifiedFeed",
      params: {
        $type: "app.certified.feed.beta.defs#certifiedFeedParams",
        viewerDid: did,
        trustedEvaluators: [subjectDid],
      },
      limit: 50,
    })
  })

  it("times out a feed request that never receives a response", async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    mockFetch.mockImplementationOnce((_url, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        )
      })
    })

    const pending = fetchCertifiedFeed(
      { viewerDid: did },
      { origin: "https://feed.example", timeoutMs: 25 },
    )
    expect(requestSignal).toBeDefined()

    const rejection = expect(pending).rejects.toMatchObject({
      message: "The feed service request timed out. Try again.",
      status: 504,
      code: null,
      retryAt: null,
    })
    await vi.advanceTimersByTimeAsync(25)
    await rejection
  })

  it("keeps the deadline active while reading the response body", async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    mockFetch.mockImplementationOnce((_url, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              requestSignal?.addEventListener(
                "abort",
                () => controller.error(requestSignal?.reason),
                { once: true },
              )
            },
          }),
          { status: 200 },
        ),
      )
    })

    const pending = fetchCertifiedFeed(
      { viewerDid: did },
      { origin: "https://feed.example", timeoutMs: 25 },
    )
    expect(requestSignal).toBeDefined()

    const rejection = expect(pending).rejects.toMatchObject({
      message: "The feed service request timed out. Try again.",
      status: 504,
      code: null,
    })
    await vi.advanceTimersByTimeAsync(25)
    await rejection
  })

  it("preserves caller cancellation instead of reporting a timeout", async () => {
    const caller = new AbortController()
    const reason = new DOMException("Route changed", "AbortError")
    mockFetch.mockImplementationOnce((_url, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        })
      })
    })

    const pending = fetchCertifiedFeed(
      { viewerDid: did },
      {
        origin: "https://feed.example",
        signal: caller.signal,
        timeoutMs: 25,
      },
    )
    caller.abort(reason)

    await expect(pending).rejects.toBe(reason)
  })

  it("stops reading an oversized error body before buffering all of it", async () => {
    const cancel = vi.fn()
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        if (pulls <= 2) {
          controller.enqueue(new Uint8Array(40 * 1024).fill(97))
          return
        }
        return new Promise<void>(() => {})
      },
      cancel,
    })
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 400 }))

    await expect(
      fetchCertifiedFeed({ viewerDid: did }, { origin: "https://feed.example" }),
    ).rejects.toMatchObject({
      status: 400,
      code: null,
      message:
        "The feed service request failed. Try again; if it keeps failing, contact support.",
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("does not wait for stream cancellation to settle after the size limit", async () => {
    let pulls = 0
    let releaseCancellation = () => {}
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        if (pulls <= 2) {
          controller.enqueue(new Uint8Array(40 * 1024).fill(97))
          return
        }
        return new Promise<void>(() => {})
      },
      cancel() {
        return new Promise<void>((resolve) => {
          releaseCancellation = resolve
        })
      },
    })
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 400 }))

    const outcome = fetchCertifiedFeed(
      { viewerDid: did },
      { origin: "https://feed.example" },
    ).then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    )
    const stalled = Symbol("stream cancellation remained pending")
    try {
      const result = await Promise.race([
        outcome,
        new Promise<typeof stalled>((resolve) =>
          setTimeout(() => resolve(stalled), 0),
        ),
      ])
      expect(result).not.toBe(stalled)
      if (result !== stalled) {
        expect(result.error).toMatchObject({ status: 400, code: null })
      }
    } finally {
      releaseCancellation()
      await outcome
    }
  })

  it("stops reading an oversized successful response at its contract limit", async () => {
    const cancel = vi.fn()
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        if (pulls <= 2) {
          controller.enqueue(new Uint8Array(300 * 1024).fill(97))
          return
        }
        return new Promise<void>(() => {})
      },
      cancel,
    })
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }))

    await expect(
      fetchCertifiedFeed({ viewerDid: did }, { origin: "https://feed.example" }),
    ).rejects.toMatchObject({
      status: 502,
      code: "InvalidResponse",
      message: expect.stringContaining("unexpectedly large"),
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("preserves recognized safe errors and parses visible Retry-After", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "InvalidCursor", message: "Discard the cursor." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    )
    await expect(
      fetchCertifiedFeed({ viewerDid: did }, { origin: "https://feed.example" }),
    ).rejects.toMatchObject({ code: "InvalidCursor", message: "Discard the cursor." })

    mockFetch.mockResolvedValue(
      new Response("gateway busy", { status: 429, headers: { "Retry-After": "2" } }),
    )
    const before = Date.now()
    let caught: unknown
    try {
      await fetchCertifiedFeed(
        { viewerDid: did },
        { origin: "https://feed.example" },
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CertifiedFeedError)
    const error = caught as CertifiedFeedError
    expect(error.code).toBeNull()
    expect(error.retryAt).toBeGreaterThanOrEqual(before + 1900)
    expect(error.message).not.toContain("gateway busy")
  })

  it("uses a generic message for recognized server-side failures", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "InternalError",
          message: "sensitive internal service detail",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    )
    let caught: unknown
    try {
      await fetchCertifiedFeed(
        { viewerDid: did },
        { origin: "https://feed.example" },
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CertifiedFeedError)
    const error = caught as CertifiedFeedError
    expect(error.code).toBe("InternalError")
    expect(error.message).toBe(
      "The feed service request failed. Try again; if it keeps failing, contact support.",
    )
    expect(error.message).not.toContain("sensitive")
  })

  it("accepts strict HTTP-date Retry-After and rejects other parseable date forms", async () => {
    const strictDate = new Date(Date.now() + 60_000).toUTCString()
    const valid = await fetchRateLimitError(strictDate)
    expect(valid.retryAt).toBe(Date.parse(strictDate))

    for (const retryAfter of [
      "-1",
      "1.5",
      "2026-07-21T10:00:00Z",
      "July 21, 2026 10:00:00 UTC",
      "Sun, 6 Nov 2094 08:49:37 GMT",
      "2147484",
      "999999999999999999999999",
    ]) {
      const invalid = await fetchRateLimitError(retryAfter)
      expect(invalid.retryAt, retryAfter).toBeNull()
    }
  })
})
