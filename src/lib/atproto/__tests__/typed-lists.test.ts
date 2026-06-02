import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init: RequestInit) => mockAuthFetch(url, init),
}))

vi.mock("@/lib/atproto/endorsement-lists-cache", () => ({
  invalidateEndorsementLists: vi.fn(),
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

async function loadModule() {
  return await import("../typed-lists")
}

describe("typed-lists / itemUriMatchesType", () => {
  it("accepts the canonical cert URI for list:certs", async () => {
    const { itemUriMatchesType, LIST_CERTS_TYPE } = await loadModule()
    expect(
      itemUriMatchesType(
        "at://did:plc:abc/org.hypercerts.claim.activity/3kabc",
        LIST_CERTS_TYPE,
      ),
    ).toBe(true)
  })

  it("rejects a bare actor URI for list:certs (wrong NSID)", async () => {
    const { itemUriMatchesType, LIST_CERTS_TYPE } = await loadModule()
    expect(
      itemUriMatchesType(
        "at://did:plc:abc/app.certified.actor.profile/self",
        LIST_CERTS_TYPE,
      ),
    ).toBe(false)
  })

  it("accepts the canonical project URI for list:projects", async () => {
    const { itemUriMatchesType, LIST_PROJECTS_TYPE } = await loadModule()
    expect(
      itemUriMatchesType(
        "at://did:plc:abc/org.hypercerts.collection/3kabc",
        LIST_PROJECTS_TYPE,
      ),
    ).toBe(true)
  })

  it("accepts the canonical actor-profile URI for list:accounts", async () => {
    const { itemUriMatchesType, LIST_ACCOUNTS_TYPE } = await loadModule()
    expect(
      itemUriMatchesType(
        "at://did:plc:abc/app.certified.actor.profile/self",
        LIST_ACCOUNTS_TYPE,
      ),
    ).toBe(true)
  })

  it("rejects a malformed URI (too few segments)", async () => {
    const { itemUriMatchesType, LIST_CERTS_TYPE } = await loadModule()
    expect(itemUriMatchesType("at://did:plc:abc", LIST_CERTS_TYPE)).toBe(false)
    expect(itemUriMatchesType("not a uri at all", LIST_CERTS_TYPE)).toBe(false)
    expect(itemUriMatchesType("", LIST_CERTS_TYPE)).toBe(false)
  })
})

describe("typed-lists / appendManyToTypedList", () => {
  it("buckets items into added / wrong-type / already-in across one RMW", async () => {
    const { appendManyToTypedList, LIST_CERTS_TYPE } = await loadModule()
    const existingItems = [
      {
        itemIdentifier: {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/already-in-list",
          cid: "cidExisting",
        },
      },
    ]
    // 1st call: getRecord. 2nd call: putRecord.
    mockAuthFetch
      .mockResolvedValueOnce(
        ok({
          cid: "cidV1",
          value: {
            $type: "org.hypercerts.collection",
            type: "list:certs",
            title: "My Certs",
            createdAt: "2026-05-26T12:00:00Z",
            items: existingItems,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          uri: "at://did:plc:owner/org.hypercerts.collection/abc",
          cid: "cidV2",
        }),
      )

    const result = await appendManyToTypedList(
      "did:plc:owner",
      "abc",
      [
        // Valid + new
        {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/new-cert-1",
          cid: "cidNew1",
        },
        // Valid + duplicate of existing
        {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/already-in-list",
          cid: "cidAlready",
        },
        // Wrong NSID for list:certs
        {
          uri: "at://did:plc:owner/app.certified.actor.profile/self",
          cid: "cidWrong",
        },
        // Valid + new + a dup of the first new entry inside the same batch
        {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/new-cert-1",
          cid: "cidNew1Again",
        },
      ],
      LIST_CERTS_TYPE,
    )

    expect(result.added).toEqual([
      "at://did:plc:owner/org.hypercerts.claim.activity/new-cert-1",
    ])
    expect(result.skippedAlreadyIn).toEqual([
      "at://did:plc:owner/org.hypercerts.claim.activity/already-in-list",
      "at://did:plc:owner/org.hypercerts.claim.activity/new-cert-1",
    ])
    expect(result.skippedWrongType).toEqual([
      "at://did:plc:owner/app.certified.actor.profile/self",
    ])
    // Exactly two fetches: getRecord + putRecord — no per-item RMW.
    expect(mockAuthFetch).toHaveBeenCalledTimes(2)
  })

  it("no-ops for empty input without any network calls", async () => {
    const { appendManyToTypedList, LIST_CERTS_TYPE } = await loadModule()
    const result = await appendManyToTypedList(
      "did:plc:owner",
      "abc",
      [],
      LIST_CERTS_TYPE,
    )
    expect(result.added).toEqual([])
    expect(result.skippedAlreadyIn).toEqual([])
    expect(result.skippedWrongType).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it("throws on list type mismatch (defence against wrong-rkey caller)", async () => {
    const { appendManyToTypedList, LIST_CERTS_TYPE } = await loadModule()
    mockAuthFetch.mockResolvedValueOnce(
      ok({
        cid: "cidV1",
        value: {
          $type: "org.hypercerts.collection",
          type: "list:accounts", // not what the caller said
          title: "Whoops",
          createdAt: "2026-05-26T12:00:00Z",
          items: [],
        },
      }),
    )
    await expect(
      appendManyToTypedList(
        "did:plc:owner",
        "abc",
        [
          {
            uri: "at://did:plc:owner/org.hypercerts.claim.activity/cert",
            cid: "cid",
          },
        ],
        LIST_CERTS_TYPE,
      ),
    ).rejects.toThrow(/list type mismatch/i)
  })
})

describe("typed-lists / removeManyFromTypedList", () => {
  it("filters items[] to drop the supplied URIs in one RMW", async () => {
    const { removeManyFromTypedList } = await loadModule()
    const existingItems = [
      {
        itemIdentifier: {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/keep",
          cid: "cidKeep",
        },
      },
      {
        itemIdentifier: {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/drop-1",
          cid: "cidDrop1",
        },
      },
      {
        itemIdentifier: {
          uri: "at://did:plc:owner/org.hypercerts.claim.activity/drop-2",
          cid: "cidDrop2",
        },
      },
    ]
    mockAuthFetch
      .mockResolvedValueOnce(
        ok({
          cid: "cidV1",
          value: {
            $type: "org.hypercerts.collection",
            type: "list:certs",
            title: "My Certs",
            createdAt: "2026-05-26T12:00:00Z",
            items: existingItems,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          uri: "at://did:plc:owner/org.hypercerts.collection/abc",
          cid: "cidV2",
        }),
      )
    const result = await removeManyFromTypedList("did:plc:owner", "abc", [
      "at://did:plc:owner/org.hypercerts.claim.activity/drop-1",
      "at://did:plc:owner/org.hypercerts.claim.activity/drop-2",
      "at://did:plc:owner/org.hypercerts.claim.activity/never-was-here",
    ])
    expect(result).toEqual({ removed: 2 })
    expect(mockAuthFetch).toHaveBeenCalledTimes(2)
  })

  it("no-ops on empty input", async () => {
    const { removeManyFromTypedList } = await loadModule()
    const result = await removeManyFromTypedList("did:plc:owner", "abc", [])
    expect(result).toEqual({ removed: 0 })
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})
