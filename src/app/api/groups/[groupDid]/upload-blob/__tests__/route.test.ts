import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Content-type allowlist + size cap for the group blob-upload route
 * (`POST` /api/groups/[groupDid]/upload-blob).
 *
 * The route accepts a raw binary body and proxies it into the group's repo, so
 * two invariants are asserted here:
 *   1. Only `image/jpeg | image/png | image/webp` are accepted; any other
 *      declared media type is rejected with 415 before the body is read or the
 *      upstream upload is attempted.
 *   2. The 5MB cap is enforced BOTH by the declared Content-Length (early
 *      rejection, body never read) AND by the actual received byte length (a
 *      lying/absent Content-Length still can't slip an oversized body through).
 *
 * The handler only reads `request.headers` and `request.arrayBuffer()`, so a
 * minimal request stub gives precise, independent control over the declared
 * length and the real body — letting us exercise the byte-length guard even
 * when Content-Length is absent.
 */

const MAX_SIZE = 5 * 1024 * 1024

vi.mock("@/lib/groups/proxy-agent", () => ({
  getAuthenticatedAgent: vi.fn(),
  createGroupClient: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn(() => null) }))

import {
  getAuthenticatedAgent,
  createGroupClient,
} from "@/lib/groups/proxy-agent"
import { checkCsrf } from "@/lib/auth/csrf"

const GROUP_DID = "did:plc:abcdefghijklmnopqrstuvwx"

const callMock = vi.fn(async () => ({ data: { blob: { $type: "blob" } } }))

function makeContext(groupDid = GROUP_DID) {
  return { params: Promise.resolve({ groupDid }) }
}

/**
 * Minimal NextRequest-shaped stub: the handler touches `headers.get`,
 * `arrayBuffer()`, and `nextUrl.searchParams` (the `?purpose=attachment`
 * selector). Content-Length is set independently of the real body so the
 * byte-length guard can be exercised without a matching declared length.
 */
function makeRequest(opts: {
  contentType?: string
  contentLength?: string
  body?: Uint8Array
  purpose?: string
}) {
  const headers = new Headers()
  if (opts.contentType !== undefined)
    headers.set("content-type", opts.contentType)
  if (opts.contentLength !== undefined)
    headers.set("content-length", opts.contentLength)
  const arrayBuffer = vi.fn(async () => {
    const b = opts.body ?? new Uint8Array()
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  })
  const nextUrl = new URL(
    `https://app.example/api/groups/${GROUP_DID}/upload-blob${
      opts.purpose ? `?purpose=${opts.purpose}` : ""
    }`,
  )
  return { headers, arrayBuffer, nextUrl }
}

async function post(
  req: ReturnType<typeof makeRequest>,
  groupDid = GROUP_DID,
): Promise<Response> {
  const { POST } = await import("../route")
  return POST(
    req as unknown as Parameters<typeof POST>[0],
    makeContext(groupDid) as unknown as Parameters<typeof POST>[1],
  )
}

beforeEach(() => {
  vi.mocked(checkCsrf).mockReset().mockReturnValue(null)
  vi.mocked(getAuthenticatedAgent)
    .mockReset()
    .mockResolvedValue({ agent: {} as never, did: "did:plc:alice" })
  callMock.mockClear()
  vi.mocked(createGroupClient)
    .mockReset()
    .mockReturnValue({ call: callMock } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("upload-blob — content-type allowlist", () => {
  for (const mime of [
    "application/pdf",
    "text/html",
    "image/gif",
    "application/octet-stream",
    "image/svg+xml",
  ]) {
    it(`rejects ${mime} with 415 and never reads the body or uploads`, async () => {
      const req = makeRequest({
        contentType: mime,
        body: new Uint8Array([1, 2, 3]),
      })
      const res = await post(req)
      expect(res.status).toBe(415)
      expect(req.arrayBuffer).not.toHaveBeenCalled()
      expect(callMock).not.toHaveBeenCalled()
    })
  }

  it("defaults to octet-stream (415) when no content-type header is present", async () => {
    const req = makeRequest({ body: new Uint8Array([1]) })
    const res = await post(req)
    expect(res.status).toBe(415)
    expect(callMock).not.toHaveBeenCalled()
  })

  it("accepts an allowed type and proxies the upload to the group repo", async () => {
    const req = makeRequest({
      contentType: "image/png",
      body: new Uint8Array([1, 2, 3]),
    })
    const res = await post(req)
    expect(res.status).toBe(200)
    expect(createGroupClient).toHaveBeenCalledWith(
      expect.anything(),
      GROUP_DID,
    )
    expect(callMock).toHaveBeenCalledTimes(1)
    const [nsid, params, payload] = callMock.mock.calls[0] as unknown as [
      string,
      { repo: string },
      Uint8Array,
    ]
    expect(nsid).toBe("app.certified.group.repo.uploadBlob")
    expect(params).toEqual({ repo: GROUP_DID })
    expect(payload).toBeInstanceOf(Uint8Array)
  })

  it("strips content-type parameters before matching the allowlist", async () => {
    const req = makeRequest({
      contentType: "image/webp; charset=binary",
      body: new Uint8Array([1]),
    })
    const res = await post(req)
    expect(res.status).toBe(200)
    expect(callMock).toHaveBeenCalledTimes(1)
  })
})

describe("upload-blob — size cap (5MB)", () => {
  it("rejects an oversized declared Content-Length with 413 before reading the body", async () => {
    const req = makeRequest({
      contentType: "image/png",
      contentLength: String(MAX_SIZE + 1),
      body: new Uint8Array([1]),
    })
    const res = await post(req)
    expect(res.status).toBe(413)
    // Early rejection: the body is never pulled into memory, and nothing is
    // proxied upstream.
    expect(req.arrayBuffer).not.toHaveBeenCalled()
    expect(callMock).not.toHaveBeenCalled()
  })

  it("rejects an oversized body with 413 even when Content-Length is absent (lying/omitted header)", async () => {
    const req = makeRequest({
      contentType: "image/png",
      body: new Uint8Array(MAX_SIZE + 1),
    })
    const res = await post(req)
    expect(res.status).toBe(413)
    expect(req.arrayBuffer).toHaveBeenCalledTimes(1)
    expect(callMock).not.toHaveBeenCalled()
  })

  it("accepts a body at exactly the 5MB boundary", async () => {
    const req = makeRequest({
      contentType: "image/jpeg",
      body: new Uint8Array(MAX_SIZE),
    })
    const res = await post(req)
    expect(res.status).toBe(200)
    expect(callMock).toHaveBeenCalledTimes(1)
  })
})

describe("upload-blob — gate", () => {
  it("returns the CSRF response before any upstream work", async () => {
    vi.mocked(checkCsrf).mockReturnValueOnce(
      new Response(JSON.stringify({ error: "csrf" }), { status: 403 }) as never,
    )
    const req = makeRequest({
      contentType: "image/png",
      body: new Uint8Array([1]),
    })
    const res = await post(req)
    expect(res.status).toBe(403)
    expect(callMock).not.toHaveBeenCalled()
  })

  it("401s when not authenticated", async () => {
    vi.mocked(getAuthenticatedAgent).mockResolvedValueOnce(null)
    const req = makeRequest({
      contentType: "image/png",
      body: new Uint8Array([1]),
    })
    const res = await post(req)
    expect(res.status).toBe(401)
    expect(callMock).not.toHaveBeenCalled()
  })

  it("400s on an invalid group DID", async () => {
    const req = makeRequest({
      contentType: "image/png",
      body: new Uint8Array([1]),
    })
    const res = await post(req, "nope")
    expect(res.status).toBe(400)
    expect(callMock).not.toHaveBeenCalled()
  })
})

/**
 * `?purpose=attachment` widens the allowlist to documents for group-owned
 * update `content[]` blobs, mirroring the XRPC proxy. Without it the route
 * stays image-only, so a PDF can never land as a group avatar or banner.
 */
describe("upload-blob — attachment purpose", () => {
  it("accepts a PDF with ?purpose=attachment", async () => {
    const req = makeRequest({
      contentType: "application/pdf",
      body: new Uint8Array([1]),
      purpose: "attachment",
    })
    const res = await post(req)
    expect(res.status).toBe(200)
    expect(callMock).toHaveBeenCalledTimes(1)
  })

  it("still rejects a PDF without the purpose flag", async () => {
    const req = makeRequest({
      contentType: "application/pdf",
      body: new Uint8Array([1]),
    })
    const res = await post(req)
    expect(res.status).toBe(415)
    expect(callMock).not.toHaveBeenCalled()
  })

  it("still rejects text/html and svg on the attachment path", async () => {
    for (const mime of ["text/html", "image/svg+xml"]) {
      callMock.mockClear()
      const req = makeRequest({
        contentType: mime,
        body: new Uint8Array([1]),
        purpose: "attachment",
      })
      const res = await post(req)
      expect(res.status).toBe(415)
      expect(callMock).not.toHaveBeenCalled()
    }
  })

  it("keeps the 5MB cap on the attachment path", async () => {
    const req = makeRequest({
      contentType: "application/pdf",
      contentLength: String(5 * 1024 * 1024 + 1),
      purpose: "attachment",
    })
    const res = await post(req)
    expect(res.status).toBe(413)
    expect(callMock).not.toHaveBeenCalled()
  })
})
