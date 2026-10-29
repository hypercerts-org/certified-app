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

describe("isSizeLimited", () => {
  it.each([
    ["https://evil.example/.well-known/oauth-authorization-server", true],
    ["https://evil.example/.well-known/did.json", true],
    ["https://evil.example/user/did.json", true],
    ["https://plc.directory/did:plc:abc", true],
    ["https://evil.example/oauth/par", true],
    ["https://evil.example/oauth/token", true],
    ["https://pds.example/xrpc/com.atproto.sync.getBlob?did=x&cid=y", false],
    ["https://pds.example/xrpc/com.atproto.repo.listRecords", false],
  ])("%s → %s", (url, expected) => {
    expect(isSizeLimited(url)).toBe(expected)
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

  it("accepts a body of exactly the cap", async () => {
    const { response } = streamed([new Uint8Array(MAX_OAUTH_RESPONSE_BYTES)])
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

  it("caps a token response requested with a Request (the DPoP path)", async () => {
    mockFetch()
    const req = new Request("https://evil.example/oauth/token", { method: "POST", body: "x=1" })
    const res = await safeFetch(req)
    await expect(res.text()).rejects.toBeInstanceOf(ResponseTooLargeError)
  })

  it("does not cap PDS XRPC responses", async () => {
    mockFetch()
    const res = await safeFetch(
      new Request("https://pds.example/xrpc/com.atproto.sync.getBlob?did=x&cid=y"),
    )
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(MAX_OAUTH_RESPONSE_BYTES)
  })
})

describe("end to end: atproto's did:web resolver behind safeFetch", () => {
  it("rejects an oversized DID document before zod sees it", async () => {
    // The attack: a did:web host serves a document with a huge array of
    // invalid entries. Without the cap zod would collect an issue per entry.
    const head = enc.encode('{"id":"did:web:evil.example","alsoKnownAs":[')
    const { response, cancel } = streamed(
      [head, ...bigArrayChunks(4 * MAX_OAUTH_RESPONSE_BYTES)],
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
