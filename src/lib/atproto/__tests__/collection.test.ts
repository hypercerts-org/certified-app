import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

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

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function err(status: number, body: unknown = { error: "no" }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function loadModule() {
  const mod = await import("../collection")
  return mod
}

const DID = "did:plc:alice"

function awardRef(rkey: string) {
  return {
    uri: `at://${DID}/app.certified.badge.award/${rkey}`,
    cid: `cid-${rkey}`,
  }
}

describe("asEndorsementListValue", () => {
  it("narrows a well-formed endorsement-list value", async () => {
    const { asEndorsementListValue } = await loadModule()
    const narrowed = asEndorsementListValue({
      type: "endorsement-list",
      title: "Frontend mentors",
      createdAt: "2026-05-20T12:00:00Z",
    })
    expect(narrowed).not.toBeNull()
    expect(narrowed?.title).toBe("Frontend mentors")
  })

  it("returns null for a project collection", async () => {
    const { asEndorsementListValue } = await loadModule()
    expect(
      asEndorsementListValue({
        type: "project",
        title: "Hypercerts",
        createdAt: "2026-05-20T12:00:00Z",
      }),
    ).toBeNull()
  })

  it("returns null when required fields are missing", async () => {
    const { asEndorsementListValue } = await loadModule()
    expect(
      asEndorsementListValue({
        type: "endorsement-list",
        createdAt: "2026-05-20T12:00:00Z",
      }),
    ).toBeNull()
    expect(
      asEndorsementListValue({
        type: "endorsement-list",
        title: "x",
      }),
    ).toBeNull()
  })
})

describe("createEndorsementListCollection", () => {
  it("posts the canonical record shape and returns the new ref", async () => {
    mockAuthFetch.mockResolvedValueOnce(ok({ uri: "at://x", cid: "c" }))
    const { createEndorsementListCollection } = await loadModule()

    const result = await createEndorsementListCollection(
      DID,
      "  Frontend mentors  ",
      "  weekly cohort ",
    )

    expect(result).toEqual({ uri: "at://x", cid: "c" })
    const [url, init] = mockAuthFetch.mock.calls[0]
    expect(url).toBe("/api/xrpc/com/atproto/repo/createRecord")
    const body = JSON.parse(init.body as string)
    expect(body.collection).toBe("org.hypercerts.collection")
    expect(body.record.type).toBe("endorsement-list")
    expect(body.record.title).toBe("Frontend mentors")
    expect(body.record.description).toBe("weekly cohort")
    expect(body.record.items).toEqual([])
  })

  it("omits description when blank", async () => {
    mockAuthFetch.mockResolvedValueOnce(ok({ uri: "at://x", cid: "c" }))
    const { createEndorsementListCollection } = await loadModule()
    await createEndorsementListCollection(DID, "Frontend", "   ")
    const body = JSON.parse(mockAuthFetch.mock.calls[0][1].body as string)
    expect(body.record.description).toBeUndefined()
  })

  it("rejects an empty title", async () => {
    const { createEndorsementListCollection } = await loadModule()
    await expect(
      createEndorsementListCollection(DID, "  "),
    ).rejects.toThrow(/required/)
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})

describe("updateEndorsementListCollection", () => {
  it("preserves items[] and createdAt across a title/description edit", async () => {
    // 1st call: getRecord with one existing item.
    const existingItems = [
      {
        itemIdentifier: awardRef("preserve-me"),
        addedAt: "2026-05-19T00:00:00Z",
      },
    ]
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        value: {
          type: "endorsement-list",
          title: "Old title",
          description: "Old desc",
          createdAt: "2026-01-01T00:00:00Z",
          items: existingItems,
          // An unknown field a future-client could add; must round-trip.
          futureField: "keep",
        },
        cid: "c0",
      }),
    )
    // 2nd call: putRecord.
    mockAuthFetch.mockResolvedValueOnce(ok({ uri: "u1", cid: "c1" }))

    const { updateEndorsementListCollection } = await loadModule()
    await updateEndorsementListCollection(DID, "list1", "New title", "New desc")

    const putBody = JSON.parse(mockAuthFetch.mock.calls[1][1].body as string)
    expect(putBody.record.title).toBe("New title")
    expect(putBody.record.description).toBe("New desc")
    expect(putBody.record.createdAt).toBe("2026-01-01T00:00:00Z")
    expect(putBody.record.items).toEqual(existingItems)
    expect(putBody.record.futureField).toBe("keep")
    expect(putBody.swapRecord).toBe("c0")
  })
})

describe("appendItemToList", () => {
  it("appends + dedupes-on-URI", async () => {
    // 1st call: getRecord with one existing item.
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        value: {
          type: "endorsement-list",
          title: "Mentors",
          createdAt: "2026-05-20T00:00:00Z",
          items: [
            {
              itemIdentifier: awardRef("aaa"),
              addedAt: "2026-05-20T00:00:00Z",
            },
          ],
        },
        cid: "c0",
      }),
    )
    // 2nd call: putRecord.
    mockAuthFetch.mockResolvedValueOnce(ok({ uri: "u1", cid: "c1" }))

    const { appendItemToList } = await loadModule()
    const result = await appendItemToList(DID, "list1", awardRef("bbb"))

    expect(result.added).toBe(true)
    expect(result.cid).toBe("c1")
    const putCall = mockAuthFetch.mock.calls[1]
    expect(putCall[0]).toBe("/api/xrpc/com/atproto/repo/putRecord")
    const putBody = JSON.parse(putCall[1].body as string)
    expect(putBody.record.items).toHaveLength(2)
    expect(putBody.record.items[1].itemIdentifier.uri).toBe(
      awardRef("bbb").uri,
    )
  })

  it("is a no-op when the award is already in the list", async () => {
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        value: {
          type: "endorsement-list",
          title: "Mentors",
          createdAt: "2026-05-20T00:00:00Z",
          items: [{ itemIdentifier: awardRef("aaa") }],
        },
        cid: "c0",
      }),
    )

    const { appendItemToList } = await loadModule()
    const result = await appendItemToList(DID, "list1", awardRef("aaa"))

    expect(result.added).toBe(false)
    expect(mockAuthFetch).toHaveBeenCalledTimes(1)
  })
})

describe("removeItemFromList", () => {
  it("drops the matching item and returns removed=true", async () => {
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        value: {
          type: "endorsement-list",
          title: "Mentors",
          createdAt: "2026-05-20T00:00:00Z",
          items: [
            { itemIdentifier: awardRef("aaa") },
            { itemIdentifier: awardRef("bbb") },
          ],
        },
        cid: "c0",
      }),
    )
    mockAuthFetch.mockResolvedValueOnce(ok({ uri: "u", cid: "c1" }))

    const { removeItemFromList } = await loadModule()
    const result = await removeItemFromList(DID, "list1", awardRef("aaa").uri)

    expect(result.removed).toBe(true)
    const putBody = JSON.parse(mockAuthFetch.mock.calls[1][1].body as string)
    expect(putBody.record.items).toHaveLength(1)
    expect(putBody.record.items[0].itemIdentifier.uri).toBe(awardRef("bbb").uri)
  })

  it("returns removed=false (no put) when the award is absent", async () => {
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        value: {
          type: "endorsement-list",
          title: "Mentors",
          createdAt: "2026-05-20T00:00:00Z",
          items: [{ itemIdentifier: awardRef("aaa") }],
        },
        cid: "c0",
      }),
    )

    const { removeItemFromList } = await loadModule()
    const result = await removeItemFromList(DID, "list1", awardRef("zzz").uri)

    expect(result.removed).toBe(false)
    expect(mockAuthFetch).toHaveBeenCalledTimes(1)
  })
})

describe("purgeAwardFromLists", () => {
  it("scans every list, edits only the ones referencing the award", async () => {
    // listRecords (page 1, terminal — no cursor).
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        records: [
          {
            uri: `at://${DID}/org.hypercerts.collection/list1`,
            cid: "cidL1",
            value: {
              type: "endorsement-list",
              title: "Mentors",
              createdAt: "2026-05-20T00:00:00Z",
              items: [{ itemIdentifier: awardRef("target") }],
            },
          },
          {
            uri: `at://${DID}/org.hypercerts.collection/list2`,
            cid: "cidL2",
            value: {
              type: "endorsement-list",
              title: "Reviewers",
              createdAt: "2026-05-20T00:00:00Z",
              items: [{ itemIdentifier: awardRef("other") }],
            },
          },
          {
            uri: `at://${DID}/org.hypercerts.collection/proj1`,
            cid: "cidP1",
            value: {
              type: "project",
              title: "Skip me",
              createdAt: "2026-05-20T00:00:00Z",
            },
          },
        ],
      }),
    )
    // For list1: getRecord + putRecord.
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        value: {
          type: "endorsement-list",
          title: "Mentors",
          createdAt: "2026-05-20T00:00:00Z",
          items: [{ itemIdentifier: awardRef("target") }],
        },
        cid: "cidL1",
      }),
    )
    mockAuthFetch.mockResolvedValueOnce(ok({ uri: "u", cid: "cidL1b" }))

    const { purgeAwardFromLists } = await loadModule()
    const result = await purgeAwardFromLists(DID, awardRef("target").uri)

    // list1 + list2 are scanned; only list1 is edited (list2 doesn't
    // reference the target; the project record is filtered out
    // earlier).
    expect(result.scanned).toBe(2)
    expect(result.updated).toBe(1)
  })
})
