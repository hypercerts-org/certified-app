import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import type { BadgeAwardRecord } from "@/lib/atproto/badges"
import type { EndorsementListCollectionValue } from "@/lib/atproto/collection"

// A faithful-but-controllable stand-in for the PDS layer. The bug under
// test (quality-034) is that the mutation callbacks read `lists` from a
// closure snapshot taken at render time, then await a write, then run an
// optimistic merge that re-applies that stale snapshot — clobbering any
// concurrent refetch that landed during the await.
//
// To exercise it we make `updateEndorsementListCollection` block on a
// deferred promise so a `refetch()` (which mutates the list's items[]) can
// resolve mid-flight, then assert the optimistic merge preserves the
// refetched items rather than reverting to the pre-await snapshot.

type ListRecord = {
  uri: string
  cid: string
  rkey: string
  value: EndorsementListCollectionValue
}

// Mutable backing store the mocked PDS reads from. Tests rewrite this to
// simulate a server-side change observed by a concurrent refetch.
let serverCollections: ListRecord[] = []
let serverAwards: BadgeAwardRecord[] = []

// Deferred control over the update write so a refetch can interleave.
let updateGate: { resolve: () => void } | null = null

vi.mock("@/lib/atproto/collection", () => ({
  listEndorsementListCollections: vi.fn(async () => serverCollections),
  createEndorsementListCollection: vi.fn(),
  updateEndorsementListCollection: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        updateGate = { resolve }
      }),
  ),
  deleteEndorsementListCollection: vi.fn(),
  appendItemToList: vi.fn(),
  appendManyItemsToList: vi.fn(),
  removeItemFromList: vi.fn(),
}))

vi.mock("@/lib/atproto/badges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atproto/badges")>()
  return {
    ...actual,
    listAwards: vi.fn(async () => serverAwards),
    createEndorsementAward: vi.fn(),
  }
})

import { useEndorsementLists } from "../use-endorsement-lists"

function award(uri: string, subjectDid: string): BadgeAwardRecord {
  return {
    uri,
    cid: `cid-${uri}`,
    rkey: uri.split("/").pop() ?? uri,
    value: {
      badge: { uri: "at://issuer/badge/x", cid: "cid-badge" },
      subject: { did: subjectDid },
      createdAt: "2026-01-01T00:00:00.000Z",
    } as BadgeAwardRecord["value"],
  }
}

function listRecord(
  rkey: string,
  title: string,
  itemUris: string[],
): ListRecord {
  return {
    uri: `at://did:issuer/org.hypercerts.collection/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    value: {
      type: "list:endorsements",
      title,
      createdAt: "2026-01-01T00:00:00.000Z",
      items: itemUris.map((uri) => ({ itemIdentifier: { uri, cid: `cid-${uri}` } })),
    } as EndorsementListCollectionValue,
  }
}

beforeEach(() => {
  cleanup()
  serverCollections = []
  serverAwards = []
  updateGate = null
  vi.clearAllMocks()
})

describe("useEndorsementLists — mutation callbacks must not clobber concurrent refetch (quality-034)", () => {
  it("updateList optimistic merge preserves items added by a refetch that lands mid-write", async () => {
    // Initial server state: one list with one item (alice).
    serverAwards = [award("at://did:issuer/badge.award/a", "did:alice")]
    serverCollections = [
      listRecord("list1", "My List", ["at://did:issuer/badge.award/a"]),
    ]

    const { result } = renderHook(() => useEndorsementLists("did:issuer"))

    // Initial load settles with one item.
    await waitFor(() => {
      expect(result.current.lists).toHaveLength(1)
      expect(result.current.lists[0].items).toHaveLength(1)
    })

    // Begin a title rename. The write blocks on updateGate; the callback
    // has already captured `existing` (the 1-item snapshot) before awaiting.
    let updatePromise: Promise<unknown>
    act(() => {
      updatePromise = result.current.updateList("list1", "Renamed List")
    })
    await waitFor(() => expect(updateGate).not.toBeNull())

    // While the write is in flight, the server grows the list to two items
    // (bob joined) and a refetch lands, updating local state.
    serverAwards = [
      award("at://did:issuer/badge.award/a", "did:alice"),
      award("at://did:issuer/badge.award/b", "did:bob"),
    ]
    serverCollections = [
      listRecord("list1", "My List", [
        "at://did:issuer/badge.award/a",
        "at://did:issuer/badge.award/b",
      ]),
    ]
    await act(async () => {
      await result.current.refetch()
    })
    await waitFor(() => expect(result.current.lists[0].items).toHaveLength(2))

    // Now let the rename write complete and run its optimistic merge.
    await act(async () => {
      updateGate!.resolve()
      await updatePromise
    })

    // The merge must apply ONLY the title change on top of current state —
    // it must NOT revert items[] back to the 1-item pre-await snapshot.
    expect(result.current.lists[0].title).toBe("Renamed List")
    expect(result.current.lists[0].items).toHaveLength(2)
    expect(result.current.lists[0].items.map((a) => a.uri)).toEqual([
      "at://did:issuer/badge.award/a",
      "at://did:issuer/badge.award/b",
    ])
  })
})
