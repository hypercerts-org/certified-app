import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Mock authFetch to a pure stub. The helper is thin enough that
 * mocking the network is the only abstraction worth — everything
 * else exercises real code.
 */
const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init: RequestInit) => mockAuthFetch(url, init),
}))

beforeEach(() => {
  mockAuthFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function importHelper() {
  // Late import — vi.mock hoists, but the helper is the unit under
  // test so we want a fresh reference each describe.
  const mod = await import("../repo-write")
  return mod.writeToRepo
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function err(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("writeToRepo", () => {
  describe("routing decision", () => {
    it("hits ownPath when targetDid === ownDid", async () => {
      mockAuthFetch.mockResolvedValueOnce(ok({ uri: "u", cid: "c" }))
      const writeToRepo = await importHelper()

      const result = await writeToRepo<{ uri: string; cid: string }>({
        ownDid: "did:plc:a",
        targetDid: "did:plc:a",
        ownPath: { url: "/own", method: "POST", body: { x: 1 } },
        groupPath: { url: "/group", method: "PUT", body: { y: 2 } },
        errorFallback: "fail",
      })

      expect(result).toEqual({ uri: "u", cid: "c" })
      expect(mockAuthFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockAuthFetch.mock.calls[0]
      expect(url).toBe("/own")
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body)).toEqual({ x: 1 })
      expect(init.headers["Content-Type"]).toBe("application/json")
    })

    it("hits groupPath when targetDid !== ownDid", async () => {
      mockAuthFetch.mockResolvedValueOnce(ok({ uri: "u2", cid: "c2" }))
      const writeToRepo = await importHelper()

      const result = await writeToRepo<{ uri: string; cid: string }>({
        ownDid: "did:plc:viewer",
        targetDid: "did:plc:group",
        ownPath: { url: "/own", method: "POST", body: { x: 1 } },
        groupPath: { url: "/group", method: "PUT", body: { y: 2 } },
        errorFallback: "fail",
      })

      expect(result).toEqual({ uri: "u2", cid: "c2" })
      const [url, init] = mockAuthFetch.mock.calls[0]
      expect(url).toBe("/group")
      expect(init.method).toBe("PUT")
      expect(JSON.parse(init.body)).toEqual({ y: 2 })
    })
  })

  describe("error handling", () => {
    it("throws the fallback message on non-2xx with no upstream `error` field", async () => {
      mockAuthFetch.mockResolvedValueOnce(err(500, {}))
      const writeToRepo = await importHelper()

      await expect(
        writeToRepo({
          ownDid: "did:plc:a",
          targetDid: "did:plc:a",
          ownPath: { url: "/x", method: "POST", body: {} },
          groupPath: { url: "/y", method: "PUT", body: {} },
          errorFallback: "Save failed",
        }),
      ).rejects.toThrow("Save failed")
    })

    it("echoes the upstream `error` field when present", async () => {
      mockAuthFetch.mockResolvedValueOnce(
        err(400, { error: "Handle must be at least 3 characters" }),
      )
      const writeToRepo = await importHelper()

      await expect(
        writeToRepo({
          ownDid: "did:plc:a",
          targetDid: "did:plc:a",
          ownPath: { url: "/x", method: "POST", body: {} },
          groupPath: { url: "/y", method: "PUT", body: {} },
          errorFallback: "Save failed",
        }),
      ).rejects.toThrow("Handle must be at least 3 characters")
    })

    it("rethrows InvalidSwapError for the group route's InvalidSwap body", async () => {
      // bug-003: on the group BFF write path (targetDid !== ownDid) a
      // CID-precondition failure must surface as InvalidSwapError so
      // saveWithSwap's conflict-rebase machinery runs. The fixed group
      // route preserves the atproto discriminator in `code` alongside
      // the redacted human `error` string.
      const { InvalidSwapError } = await import("../repo-write")
      mockAuthFetch.mockResolvedValueOnce(
        err(400, { error: "Record was modified", code: "InvalidSwap" }),
      )
      const writeToRepo = await importHelper()

      await expect(
        writeToRepo({
          ownDid: "did:plc:viewer",
          targetDid: "did:plc:group",
          ownPath: { url: "/own", method: "POST", body: {} },
          groupPath: { url: "/api/groups/did:plc:group/activity", method: "PUT", body: {} },
          errorFallback: "Save failed",
        }),
      ).rejects.toBeInstanceOf(InvalidSwapError)
    })

    it("falls back when upstream returns non-JSON", async () => {
      mockAuthFetch.mockResolvedValueOnce(
        new Response("not json", { status: 502 }),
      )
      const writeToRepo = await importHelper()

      await expect(
        writeToRepo({
          ownDid: "did:plc:a",
          targetDid: "did:plc:a",
          ownPath: { url: "/x", method: "POST", body: {} },
          groupPath: { url: "/y", method: "PUT", body: {} },
          errorFallback: "Save failed",
        }),
      ).rejects.toThrow("Save failed")
    })
  })

  describe("response parsing", () => {
    it("returns the parsed JSON body cast to T", async () => {
      mockAuthFetch.mockResolvedValueOnce(
        ok({ uri: "at://did:plc:x/foo/bar", cid: "bafy123" }),
      )
      const writeToRepo = await importHelper()

      const result = await writeToRepo<{ uri: string; cid: string }>({
        ownDid: "did:plc:a",
        targetDid: "did:plc:a",
        ownPath: { url: "/x", method: "POST", body: {} },
        groupPath: { url: "/y", method: "PUT", body: {} },
        errorFallback: "fail",
      })
      expect(result.uri).toBe("at://did:plc:x/foo/bar")
      expect(result.cid).toBe("bafy123")
    })

    it("propagates the body even when caller passes T = unknown", async () => {
      mockAuthFetch.mockResolvedValueOnce(ok({ success: true }))
      const writeToRepo = await importHelper()

      const result = await writeToRepo<unknown>({
        ownDid: "did:plc:a",
        targetDid: "did:plc:a",
        ownPath: { url: "/x", method: "POST", body: {} },
        groupPath: { url: "/y", method: "PUT", body: {} },
        errorFallback: "fail",
      })
      expect(result).toEqual({ success: true })
    })
  })

  describe("body serialization", () => {
    it("serializes the body as JSON", async () => {
      mockAuthFetch.mockResolvedValueOnce(ok({}))
      const writeToRepo = await importHelper()

      await writeToRepo({
        ownDid: "did:plc:a",
        targetDid: "did:plc:a",
        ownPath: {
          url: "/x",
          method: "POST",
          body: { nested: { value: [1, 2, 3] }, str: "ok" },
        },
        groupPath: { url: "/y", method: "PUT", body: {} },
        errorFallback: "fail",
      })

      const init = mockAuthFetch.mock.calls[0][1]
      expect(init.body).toBe(
        JSON.stringify({ nested: { value: [1, 2, 3] }, str: "ok" }),
      )
    })

    it("preserves arbitrary URL paths verbatim (no double-encoding)", async () => {
      mockAuthFetch.mockResolvedValueOnce(ok({}))
      const writeToRepo = await importHelper()

      await writeToRepo({
        ownDid: "did:plc:a",
        targetDid: "did:plc:b",
        ownPath: { url: "/own", method: "POST", body: {} },
        groupPath: {
          url: "/api/groups/did%3Aplc%3Ab/profile",
          method: "PUT",
          body: {},
        },
        errorFallback: "fail",
      })

      expect(mockAuthFetch.mock.calls[0][0]).toBe(
        "/api/groups/did%3Aplc%3Ab/profile",
      )
    })
  })
})
