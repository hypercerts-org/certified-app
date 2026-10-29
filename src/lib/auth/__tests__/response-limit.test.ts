import { describe, it, expect, vi, afterEach } from "vitest"

/**
 * Size cap on the OAuth client's zod-validated responses (TECH-804,
 * GHSA-mrhx-c7xc-m3w5): metadata, DID documents, PAR and token responses
 * from servers an anonymous visitor can choose. PDS XRPC traffic is exempt.
 */

vi.mock("@/lib/auth/stores", () => ({
  getRedis: vi.fn(),
  RedisStateStore: class {},
  RedisSessionStore: class {},
}))

import {
  MAX_OAUTH_RESPONSE_BYTES,
  ResponseTooLargeError,
  isSizeLimited,
  limitResponseSize,
} from "../response-limit"
import { safeFetch } from "../oauth-client"
import { DidResolverCommon } from "@atproto/oauth-client-node"

const URL_META = "https://evil.example/.well-known/oauth-authorization-server"
const enc = new TextEncoder()

/** A body streamed in chunks, with a spy on upstream cancellation. */
function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const cancel = vi.fn()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++])
      else controller.close()
    },
    cancel,
  })
  return { response: new Response(body, { headers }), cancel }
}

/** A JSON array of `n` failing elements: the zod DoS payload shape. */
function bigArrayChunks(totalBytes: number, chunkBytes = 16 * 1024) {
  const chunks: Uint8Array[] = []
  for (let sent = 0; sent < totalBytes; sent += chunkBytes) {
    chunks.push(enc.encode("0,".repeat(chunkBytes / 2)))
  }
  return chunks
}

afterEach(() => {
  vi.restoreAllMocks()
})

const AUTHED = new Headers({ authorization: "DPoP token", dpop: "proof" })
const PROOF_ONLY = new Headers({ dpop: "proof" })

describe("isSizeLimited", () => {
  it.each([
    ["https://evil.example/.well-known/oauth-authorization-server", PROOF_ONLY, true],
    ["https://evil.example/.well-known/did.json", PROOF_ONLY, true],
    ["https://plc.directory/did:plc:abc", PROOF_ONLY, true],
    ["https://evil.example/oauth/par", PROOF_ONLY, true],
    ["https://evil.example/oauth/token", PROOF_ONLY, true],
    // A hostile authorization server can publish its token/PAR endpoint
    // under /xrpc/; those requests carry a DPoP proof but no Authorization.
    ["https://evil.example/xrpc/token", PROOF_ONLY, true],
    ["https://evil.example/.well-known/xrpc-evil", AUTHED, true],
    ["https://evil.example/xrpcfoo", AUTHED, true],
    ["https://pds.example/xrpc/com.atproto.sync.getBlob?did=x&cid=y", AUTHED, false],
    ["https://pds.example/xrpc/com.atproto.repo.listRecords", AUTHED, false],
  ])("%s → %s", (url, headers, expected) => {
    expect(isSizeLimited(url, headers)).toBe(expected)
  })
})

describe("limitResponseSize", () => {
  it("passes a small JSON body through unchanged, keeping status, headers and url", async () => {
    const original = new Response(JSON.stringify({ issuer: "https://ok.example" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
    Object.defineProperty(original, "url", { value: URL_META })

    const limited = limitResponseSize(original, URL_META)

    expect(limited.status).toBe(200)
    expect(limited.headers.get("content-type")).toBe("application/json")
    expect(limited.url).toBe(URL_META)
    expect(await limited.json()).toEqual({ issuer: "https://ok.example" })
  })

  it("fails at once on a declared Content-Length over the cap and cancels the body", () => {
    const { response, cancel } = streamed([enc.encode("[]")], {
      "content-length": String(MAX_OAUTH_RESPONSE_BYTES + 1),
    })

    expect(() => limitResponseSize(response, URL_META)).toThrow(ResponseTooLargeError)
    expect(cancel).toHaveBeenCalled()
  })

  it("errors a streamed body once it passes the cap, and cancels upstream", async () => {
    const chunks = bigArrayChunks(4 * MAX_OAUTH_RESPONSE_BYTES)
    const { response, cancel } = streamed(chunks)

    const limited = limitResponseSize(response, URL_META)

    await expect(limited.json()).rejects.toBeInstanceOf(ResponseTooLargeError)
    expect(cancel).toHaveBeenCalled()
  })

  it("does not trust a Content-Length that understates the body", async () => {
    const { response } = streamed(bigArrayChunks(2 * MAX_OAUTH_RESPONSE_BYTES), {
      "content-length": "10",
    })

    await expect(limitResponseSize(response, URL_META).text()).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    )
  })

  it.each([
    ["without", {}],
    ["with", { "content-length": String(MAX_OAUTH_RESPONSE_BYTES) }],
  ])("accepts a body of exactly the cap %s a Content-Length", async (_label, headers) => {
    const { response } = streamed([new Uint8Array(MAX_OAUTH_RESPONSE_BYTES)], headers)
    const buf = await limitResponseSize(response, URL_META).arrayBuffer()
    expect(buf.byteLength).toBe(MAX_OAUTH_RESPONSE_BYTES)
  })

  it("leaves a body-less response alone", () => {
    const empty = new Response(null, { status: 204 })
    expect(limitResponseSize(empty, URL_META)).toBe(empty)
  })

  it("names only the origin in the error message", async () => {
    const { response } = streamed(bigArrayChunks(2 * MAX_OAUTH_RESPONSE_BYTES))
    const err = await limitResponseSize(response, `${URL_META}?secret=1`).text().catch((e) => e)
    expect(err.message).toBe(
      `Response from https://evil.example exceeds ${MAX_OAUTH_RESPONSE_BYTES} bytes`,
    )
  })
})

describe("safeFetch", () => {
  function mockFetch() {
    return vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => streamed(bigArrayChunks(4 * MAX_OAUTH_RESPONSE_BYTES)).response)
  }

  it("caps a discovery response requested by URL string", async () => {
    mockFetch()
    const res = await safeFetch(URL_META)
    await expect(res.json()).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it.each(["https://evil.example/oauth/token", "https://evil.example/xrpc/token"])(
    "caps a token response requested with a Request (the DPoP path): %s",
    async (url) => {
      mockFetch()
      const req = new Request(url, { method: "POST", body: "x=1", headers: { dpop: "proof" } })
      const res = await safeFetch(req)
      await expect(res.text()).rejects.toBeInstanceOf(ResponseTooLargeError)
    },
  )

  it("chooses the cap by the request, not the final response url", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const { response } = streamed(bigArrayChunks(4 * MAX_OAUTH_RESPONSE_BYTES))
      Object.defineProperty(response, "url", { value: "https://pds.example/xrpc/redirected" })
      return response
    })
    const res = await safeFetch(URL_META, { headers: { authorization: "DPoP t" } })
    await expect(res.json()).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it("does not cap authenticated XRPC calls to the PDS", async () => {
    mockFetch()
    const res = await safeFetch(
      new Request("https://pds.example/xrpc/com.atproto.sync.getBlob?did=x&cid=y", {
        headers: { authorization: "DPoP token", dpop: "proof" },
      }),
    )
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(MAX_OAUTH_RESPONSE_BYTES)
  })
})

// The Next.js #90826 workaround safeFetch has always applied: a Request is
// re-issued as (url, init) with its body buffered once.
describe("safeFetch — Request forwarding", () => {
  function okFetch() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"))
  }

  it("re-issues a Request with a body as (url, init) with the body buffered", async () => {
    const fetchSpy = okFetch()
    await safeFetch(
      new Request("https://pds.example/xrpc/com.atproto.repo.createRecord", {
        method: "POST",
        body: '{"a":1}',
        headers: { authorization: "DPoP t", "content-type": "application/json" },
      }),
    )

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("https://pds.example/xrpc/com.atproto.repo.createRecord")
    expect(init?.method).toBe("POST")
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"a":1}')
    expect(new Headers(init?.headers).get("authorization")).toBe("DPoP t")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("forwards an empty-but-explicit POST body as 0 bytes", async () => {
    const fetchSpy = okFetch()
    await safeFetch(new Request("https://pds.example/xrpc/x", { method: "POST", body: "" }))
    expect((fetchSpy.mock.calls[0][1]?.body as ArrayBuffer).byteLength).toBe(0)
  })

  it("names a Request body that can't be read", async () => {
    okFetch()
    const req = new Request("https://pds.example/xrpc/x", { method: "POST", body: "x" })
    await req.text()
    await expect(safeFetch(req)).rejects.toMatchObject({ name: "SafeFetchBodyReadError" })
  })

  it("warns outside production when init comes with a Request", async () => {
    okFetch()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await safeFetch(new Request("https://pds.example/xrpc/x"), {})
    expect(warn).toHaveBeenCalledWith(
      "[safeFetch] unexpected init alongside Request — body buffering may need revisit",
    )
  })
})

describe("end to end: atproto's did:web resolver behind safeFetch", () => {
  it("rejects an oversized DID document before zod sees it", async () => {
    // The attack: a did:web host serves a valid JSON document with a huge
    // array of invalid entries (numbers where zod expects strings). Without
    // the cap it parses fine and zod collects an issue per entry.
    const head = enc.encode('{"id":"did:web:evil.example","alsoKnownAs":[')
    const { response, cancel } = streamed(
      [head, ...bigArrayChunks(4 * MAX_OAUTH_RESPONSE_BYTES), enc.encode("0]}")],
      { "content-type": "application/did+ld+json" },
    )
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response)

    const resolver = new DidResolverCommon({ fetch: safeFetch })
    const err = await resolver.resolve("did:web:evil.example").catch((e: unknown) => e)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://evil.example/.well-known/did.json")
    let cause: unknown = err
    while (cause && !(cause instanceof ResponseTooLargeError)) cause = (cause as Error).cause
    expect(cause).toBeInstanceOf(ResponseTooLargeError)
    expect(cancel).toHaveBeenCalled()
  })
})
