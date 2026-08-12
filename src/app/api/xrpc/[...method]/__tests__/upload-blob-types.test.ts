import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ALLOWED_DOCUMENT_CONTENT_TYPES } from "@/lib/atproto/blob-types"

/**
 * Tests for the blob MIME gate in the XRPC proxy's uploadBlob handler.
 *
 * Two sets, selected by `?purpose=attachment`. Attachment surfaces
 * (update `content[]` blobs) take documents; everything else stays
 * image-only so a PDF can never land as an avatar or banner. Before
 * this split the client passed an `allowAnyType` flag that the server
 * ignored entirely — a PDF attachment 415'd with no way to opt in.
 *
 * Also pinned: neither set may contain `text/html` or `image/svg+xml`.
 * Blobs are served back from the PDS under its own origin, so either
 * one is a stored-XSS vector against that origin.
 */

const getSessionDid = vi.fn()
const getOAuthClient = vi.fn()
const uploadBlob = vi.fn()

vi.mock("@/lib/auth/oauth-client", () => ({ getOAuthClient }))
vi.mock("@/lib/auth/session", () => ({
  getSessionDid,
  deleteSession: vi.fn(),
}))
vi.mock("@/lib/auth/csrf", () => ({ checkCsrf: vi.fn() }))
vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(),
  invalidateDidDoc: vi.fn(),
}))
vi.mock("@/lib/auth/rate-limit", () => ({
  checkAndIncrementWriteRate: vi.fn(),
  RATE_LIMITED_WRITE_COLLECTIONS: {},
  makeLimiter: (name: string, max: number, windowSec: number) => ({
    name,
    max,
    windowSec,
  }),
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock("@/lib/utils/ip", () => ({ clientIp: () => "test-ip" }))
vi.mock("@atproto/api", () => ({
  Agent: class {
    com = { atproto: { repo: { uploadBlob } } }
  },
}))

const OWN_DID = "did:plc:s4puetfspot742ai7y4otuel"
const METHOD = "com.atproto.repo.uploadBlob"

function makeRequest(mimeType: string, purpose?: string) {
  const url = new URL(
    `https://app.example/api/xrpc/${METHOD}${purpose ? `?purpose=${purpose}` : ""}`,
  )
  return {
    nextUrl: url,
    headers: new Headers({ "content-type": mimeType }),
    arrayBuffer: async () => new ArrayBuffer(16),
  } as unknown as Parameters<Awaited<typeof import("../route")>["POST"]>[0]
}

const params = { params: Promise.resolve({ method: METHOD.split(".") }) }

beforeEach(() => {
  getSessionDid.mockReset().mockResolvedValue(OWN_DID)
  getOAuthClient.mockReset().mockResolvedValue({
    restore: vi.fn().mockResolvedValue({}),
  })
  uploadBlob.mockReset().mockResolvedValue({ data: { blob: { ref: {} } } })
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("uploadBlob MIME gate — default (image) surface", () => {
  it("accepts an image", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest("image/png"), params)
    expect(res.status).toBe(200)
    expect(uploadBlob).toHaveBeenCalledTimes(1)
  })

  it("rejects a PDF without the attachment purpose", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest("application/pdf"), params)
    expect(res.status).toBe(415)
    expect(uploadBlob).not.toHaveBeenCalled()
  })

  it("ignores an unrecognized purpose value and stays image-only", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest("application/pdf", "avatar"), params)
    expect(res.status).toBe(415)
    expect(uploadBlob).not.toHaveBeenCalled()
  })
})

describe("uploadBlob MIME gate — attachment surface", () => {
  it("accepts a PDF with ?purpose=attachment", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("application/pdf", "attachment"),
      params,
    )
    expect(res.status).toBe(200)
    expect(uploadBlob).toHaveBeenCalledTimes(1)
  })

  it("still rejects an executable with ?purpose=attachment", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("application/x-msdownload", "attachment"),
      params,
    )
    expect(res.status).toBe(415)
    expect(uploadBlob).not.toHaveBeenCalled()
  })

  it("tolerates a charset parameter on the content type", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest("text/plain; charset=utf-8", "attachment"),
      params,
    )
    expect(res.status).toBe(200)
    expect(uploadBlob).toHaveBeenCalledTimes(1)
  })
})

describe("document MIME set — XSS-vector types stay out", () => {
  it.each(["text/html", "image/svg+xml"])("%s is not a document type", (type) => {
    expect(ALLOWED_DOCUMENT_CONTENT_TYPES).not.toContain(type)
  })

  it("rejects text/html even on the attachment path", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest("text/html", "attachment"), params)
    expect(res.status).toBe(415)
    expect(uploadBlob).not.toHaveBeenCalled()
  })

  it("rejects image/svg+xml even on the attachment path", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest("image/svg+xml", "attachment"), params)
    expect(res.status).toBe(415)
    expect(uploadBlob).not.toHaveBeenCalled()
  })
})
