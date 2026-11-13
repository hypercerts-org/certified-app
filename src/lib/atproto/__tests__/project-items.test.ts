import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init?: RequestInit) => mockAuthFetch(url, init),
}))

import {
  applyItemChanges,
  createOwnProject,
  itemUris,
  updateOwnProjectItems,
} from "../project-items"

const DID = "did:plc:me"
const OTHER = "did:plc:someone"
const PROJECT = `at://${DID}/org.hypercerts.collection/p1`
const a = (n: number) => ({
  uri: `at://${DID}/org.hypercerts.claim.activity/a${n}`,
  cid: `cid-a${n}`,
})
const entry = (n: number) => ({ itemIdentifier: a(n) })

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
function fail(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  mockAuthFetch.mockReset()
})

describe("applyItemChanges", () => {
  it("appends new refs in order and skips ones already listed", () => {
    const r = applyItemChanges([entry(1)], { add: [a(1), a(2), a(3), a(2)] })
    expect(itemUris(r.items)).toEqual([a(1).uri, a(2).uri, a(3).uri])
    expect(r.items[1]).toEqual({ itemIdentifier: a(2) })
    expect(r.added).toEqual([a(2).uri, a(3).uri])
    expect(r.removed).toEqual([])
  })

  it("removes every entry with a URI and keeps the rest untouched", () => {
    const extra = { itemIdentifier: a(2), itemWeight: "3" }
    const unknown = { somethingElse: true }
    const r = applyItemChanges([entry(1), extra, unknown, entry(1)], {
      remove: [a(1).uri, a(9).uri],
    })
    expect(r.items).toEqual([extra, unknown])
    expect(r.removed).toEqual([a(1).uri])
    expect(r.added).toEqual([])
  })

  it("treats a missing or malformed items value as empty", () => {
    expect(applyItemChanges(undefined, { add: [a(1)] }).items).toEqual([entry(1)])
    expect(applyItemChanges("nope", { remove: [a(1).uri] }).items).toEqual([])
  })

  it("ignores refs without a CID", () => {
    const r = applyItemChanges([], { add: [{ uri: a(1).uri, cid: "" }] })
    expect(r.items).toEqual([])
    expect(r.added).toEqual([])
  })

  it("reports no change when a URI is removed and added back", () => {
    const r = applyItemChanges([entry(1)], { remove: [a(1).uri], add: [a(1)] })
    expect(itemUris(r.items)).toEqual([a(1).uri])
    expect(r.added).toEqual([])
    expect(r.removed).toEqual([])
  })
})

describe("updateOwnProjectItems", () => {
  const stored = {
    uri: PROJECT,
    cid: "cid-v1",
    value: {
      $type: "org.hypercerts.collection",
      type: "project",
      title: "Watershed",
      createdAt: "2025-01-01T00:00:00.000Z",
      items: [entry(1)],
    },
  }

  it("reads the project, then writes it once with swapRecord to the personal repo", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(ok(stored))
      .mockResolvedValueOnce(ok({ uri: PROJECT, cid: "cid-v2" }))

    const result = await updateOwnProjectItems(DID, PROJECT, { add: [a(2)] })

    expect(mockAuthFetch).toHaveBeenCalledTimes(2)
    const [readUrl] = mockAuthFetch.mock.calls[0]
    expect(readUrl).toContain("/api/xrpc/com/atproto/repo/getRecord?")
    expect(readUrl).toContain(`repo=${encodeURIComponent(DID)}`)
    expect(readUrl).toContain("rkey=p1")

    const [writeUrl, init] = mockAuthFetch.mock.calls[1]
    expect(writeUrl).toBe("/api/xrpc/com/atproto/repo/putRecord")
    const body = JSON.parse(init.body as string)
    expect(body.repo).toBe(DID)
    expect(body.collection).toBe("org.hypercerts.collection")
    expect(body.rkey).toBe("p1")
    expect(body.swapRecord).toBe("cid-v1")
    // Every other field survives; the new item is appended.
    expect(body.record.title).toBe("Watershed")
    expect(body.record.createdAt).toBe("2025-01-01T00:00:00.000Z")
    expect(body.record.items).toEqual([entry(1), entry(2)])

    expect(result.added).toEqual([a(2).uri])
    expect(result.removed).toEqual([])
    expect(result.record.cid).toBe("cid-v2")
    expect(result.record.value.items).toEqual([entry(1), entry(2)])
  })

  it("drops items entirely when the last activity is removed", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(ok(stored))
      .mockResolvedValueOnce(ok({ uri: PROJECT, cid: "cid-v2" }))

    const result = await updateOwnProjectItems(DID, PROJECT, { remove: [a(1).uri] })

    const body = JSON.parse(mockAuthFetch.mock.calls[1][1].body as string)
    expect("items" in body.record).toBe(false)
    expect(result.removed).toEqual([a(1).uri])
  })

  it("writes nothing when nothing changes", async () => {
    mockAuthFetch.mockResolvedValueOnce(ok(stored))
    const result = await updateOwnProjectItems(DID, PROJECT, { add: [a(1)] })
    expect(mockAuthFetch).toHaveBeenCalledTimes(1)
    expect(result.added).toEqual([])
    expect(result.record.cid).toBe("cid-v1")
  })

  it("retries on the newer version after an InvalidSwap, keeping the other edit", async () => {
    const newer = {
      ...stored,
      cid: "cid-v1b",
      value: { ...stored.value, items: [entry(1), entry(3)] },
    }
    mockAuthFetch
      .mockResolvedValueOnce(ok(stored))
      .mockResolvedValueOnce(fail(400, { error: "InvalidSwap", code: "InvalidSwap" }))
      .mockResolvedValueOnce(ok(newer))
      .mockResolvedValueOnce(ok({ uri: PROJECT, cid: "cid-v2" }))

    const result = await updateOwnProjectItems(DID, PROJECT, { add: [a(2)] })

    expect(mockAuthFetch).toHaveBeenCalledTimes(4)
    const body = JSON.parse(mockAuthFetch.mock.calls[3][1].body as string)
    expect(body.swapRecord).toBe("cid-v1b")
    expect(body.record.items).toEqual([entry(1), entry(3), entry(2)])
    expect(result.record.cid).toBe("cid-v2")
  })

  it("gives up with a plain message after repeated conflicts", async () => {
    mockAuthFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("getRecord")
          ? ok(stored)
          : fail(400, { error: "InvalidSwap", code: "InvalidSwap" }),
      ),
    )
    await expect(
      updateOwnProjectItems(DID, PROJECT, { add: [a(2)] }, { maxAttempts: 2 }),
    ).rejects.toThrow("This project was changed somewhere else")
    expect(mockAuthFetch).toHaveBeenCalledTimes(4)
  })

  it("refuses a project on another repo without any request", async () => {
    await expect(
      updateOwnProjectItems(DID, `at://${OTHER}/org.hypercerts.collection/p1`, {
        add: [a(2)],
      }),
    ).rejects.toThrow("personal account")
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it("refuses a URI that isn't a project", async () => {
    await expect(
      updateOwnProjectItems(DID, a(1).uri, { add: [a(2)] }),
    ).rejects.toThrow("isn't a project")
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it("surfaces a failed read as a plain message", async () => {
    mockAuthFetch.mockResolvedValueOnce(fail(500, { error: "boom" }))
    await expect(updateOwnProjectItems(DID, PROJECT, { add: [a(2)] })).rejects.toThrow(
      "Couldn't load the project",
    )
  })
})

describe("createOwnProject", () => {
  it("creates a project with the given items on the personal repo", async () => {
    mockAuthFetch.mockResolvedValueOnce(
      ok({ uri: `at://${DID}/org.hypercerts.collection/new1`, cid: "cid-new" }),
    )

    const record = await createOwnProject(DID, {
      title: "  River survey  ",
      items: [a(1), a(2), a(1)],
    })

    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe("/api/xrpc/com/atproto/repo/createRecord")
    const body = JSON.parse(init.body as string)
    expect(body.repo).toBe(DID)
    expect(body.collection).toBe("org.hypercerts.collection")
    expect(body.record).toMatchObject({
      $type: "org.hypercerts.collection",
      type: "project",
      title: "River survey",
      items: [entry(1), entry(2)],
    })
    expect(typeof body.record.createdAt).toBe("string")
    expect(record.uri).toBe(`at://${DID}/org.hypercerts.collection/new1`)
    expect(record.value.title).toBe("River survey")
  })

  it("refuses an empty name", async () => {
    await expect(createOwnProject(DID, { title: "   ", items: [] })).rejects.toThrow(
      "Give the project a name",
    )
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it("maps a failed write to a plain message", async () => {
    mockAuthFetch.mockResolvedValueOnce(fail(401, { error: "AuthRequired" }))
    await expect(createOwnProject(DID, { title: "River survey", items: [] })).rejects.toThrow(
      "Your session has expired",
    )
  })
})
