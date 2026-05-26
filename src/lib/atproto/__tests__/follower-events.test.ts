import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  fetchFollowerEvents,
  hydrateFeedEvents,
  FollowerEventsError,
  type FeedEvent,
} from "../follower-events"

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function respondWith(body: unknown, status = 200): void {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const sampleNode = {
  id: "at://did:plc:alice/org.hypercerts.claim.activity/abc",
  kind: "cert.create",
  subjectUri: "at://did:plc:alice/org.hypercerts.claim.activity/abc",
  sortAt: "2026-05-26T00:00:00.000Z",
  actor: {
    did: "did:plc:alice",
    handle: "alice.test",
    displayName: "Alice",
    avatarCid: null,
    pds: null,
  },
}

describe("fetchFollowerEvents", () => {
  it("parses a happy-path response into a FeedEventPage", async () => {
    respondWith({
      data: {
        followerEvents: {
          edges: [{ cursor: "c1", node: sampleNode }],
          pageInfo: { hasNextPage: true, endCursor: "c1" },
        },
      },
    })

    const page = await fetchFollowerEvents({ authors: ["did:plc:alice"] })

    expect(page.events).toHaveLength(1)
    expect(page.events[0].id).toBe(sampleNode.id)
    expect(page.events[0].kind).toBe("cert.create")
    expect(page.events[0].actor.did).toBe("did:plc:alice")
    expect(page.hasNextPage).toBe(true)
    expect(page.endCursor).toBe("c1")
  })

  it("forwards default first = 20 when omitted", async () => {
    respondWith({
      data: { followerEvents: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    await fetchFollowerEvents({ authors: ["did:plc:a"] })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.variables.first).toBe(20)
  })

  it("forwards kinds as null when omitted or empty", async () => {
    respondWith({
      data: { followerEvents: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    await fetchFollowerEvents({ authors: ["did:plc:a"], kinds: [] })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.variables.kinds).toBeNull()
  })

  it("returns an empty page for empty authors (load-bearing)", async () => {
    respondWith({
      data: { followerEvents: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    const page = await fetchFollowerEvents({ authors: [] })
    expect(page.events).toEqual([])
    expect(page.hasNextPage).toBe(false)
  })

  it("maps AUTHORS_FILTER_TOO_LARGE to a typed FollowerEventsError", async () => {
    respondWith({
      errors: [
        { message: "too many", extensions: { code: "AUTHORS_FILTER_TOO_LARGE" } },
      ],
    })
    await expect(fetchFollowerEvents({ authors: ["did:plc:a"] })).rejects.toMatchObject({
      name: "FollowerEventsError",
      code: "AUTHORS_FILTER_TOO_LARGE",
    })
  })

  it("maps INVALID_CURSOR to a typed FollowerEventsError", async () => {
    respondWith({
      errors: [
        { message: "bad cursor", extensions: { code: "INVALID_CURSOR" } },
      ],
    })
    await expect(
      fetchFollowerEvents({ authors: ["did:plc:a"], after: "garbage" }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" })
  })

  it("maps AUTHORS_REQUIRED to a typed FollowerEventsError (defensive)", async () => {
    respondWith({
      errors: [
        { message: "authors required", extensions: { code: "AUTHORS_REQUIRED" } },
      ],
    })
    await expect(
      fetchFollowerEvents({ authors: ["did:plc:a"] }),
    ).rejects.toMatchObject({ code: "AUTHORS_REQUIRED" })
  })

  it("leaves code = null for unknown extension codes", async () => {
    respondWith({
      errors: [{ message: "weird", extensions: { code: "SOMETHING_ELSE" } }],
    })
    await expect(
      fetchFollowerEvents({ authors: ["did:plc:a"] }),
    ).rejects.toMatchObject({ code: null })
  })

  it("throws FollowerEventsError(code: null) on non-OK HTTP", async () => {
    respondWith({}, 502)
    const err = await fetchFollowerEvents({ authors: ["did:plc:a"] }).catch((e) => e)
    expect(err).toBeInstanceOf(FollowerEventsError)
    expect(err.code).toBeNull()
  })
})

describe("hydrateFeedEvents", () => {
  function makeEvent(kind: string, suffix: string): FeedEvent {
    return {
      id: `at://did:plc:x/${kind}/${suffix}`,
      kind,
      subjectUri: `at://did:plc:x/${kind}/${suffix}`,
      sortAt: "2026-05-26T00:00:00.000Z",
      actor: {
        did: "did:plc:x",
        handle: "x.test",
        displayName: "X",
        avatarCid: null,
        pds: null,
      },
    }
  }

  it("returns [] immediately for an empty input", async () => {
    const out = await hydrateFeedEvents([])
    expect(out).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("skips the round-trip when every event is an unknown kind", async () => {
    const events = [makeEvent("unknown.kind", "a"), makeEvent("future.kind", "b")]
    const out = await hydrateFeedEvents(events)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(out).toHaveLength(2)
    expect(out[0].payload).toBeNull()
    expect(out[1].payload).toBeNull()
  })

  it("buckets events by kind and preserves input order", async () => {
    const events = [
      makeEvent("cert.create", "a"),
      makeEvent("collection.create", "b"),
      makeEvent("badge.award", "c"),
      makeEvent("legacy.endorsement", "d"),
      makeEvent("future.kind", "e"),
    ]
    respondWith({
      data: {
        activities: {
          edges: [
            {
              node: {
                uri: events[0].subjectUri,
                cid: "c1",
                did: "did:plc:x",
                title: "Cert title",
                shortDescription: "desc",
                createdAt: "2026-05-26T00:00:00.000Z",
                startDate: null,
                endDate: null,
                labels: [],
                image: null,
                workScope: null,
              },
            },
          ],
        },
        collections: {
          edges: [
            {
              node: {
                uri: events[1].subjectUri,
                cid: "c2",
                did: "did:plc:x",
                title: "Project title",
                shortDescription: "desc",
                createdAt: "2026-05-26T00:00:00.000Z",
                type: "project",
                items: null,
                banner: null,
              },
            },
          ],
        },
        badgeAwards: {
          edges: [
            {
              node: {
                uri: events[2].subjectUri,
                cid: "c3",
                did: "did:plc:x",
                createdAt: "2026-05-26T00:00:00.000Z",
                note: "nice",
                subject: { did: "did:plc:subject" },
              },
            },
          ],
        },
        legacyEndorsements: {
          edges: [
            {
              node: {
                uri: events[3].subjectUri,
                did: "did:plc:x",
                createdAt: "2026-05-26T00:00:00.000Z",
                subject: { did: "did:plc:subject" },
              },
            },
          ],
        },
      },
    })

    const out = await hydrateFeedEvents(events)
    expect(out).toHaveLength(5)
    expect(out.map((h) => h.event.id)).toEqual(events.map((e) => e.id))
    expect(out[0].payload?.kind).toBe("cert.create")
    expect(out[1].payload?.kind).toBe("collection.create")
    expect(out[2].payload?.kind).toBe("badge.award")
    expect(out[3].payload?.kind).toBe("legacy.endorsement")
    expect(out[4].payload).toBeNull()
  })

  it("returns payload null for events whose by-URI lookup missed", async () => {
    const events = [makeEvent("cert.create", "a"), makeEvent("cert.create", "b")]
    respondWith({
      data: {
        activities: {
          edges: [
            {
              node: {
                uri: events[0].subjectUri,
                cid: "c1",
                did: "did:plc:x",
                title: "Only A",
                shortDescription: "",
                createdAt: "2026-05-26T00:00:00.000Z",
                startDate: null,
                endDate: null,
                labels: [],
                image: null,
                workScope: null,
              },
            },
          ],
        },
        collections: { edges: [] },
        badgeAwards: { edges: [] },
        legacyEndorsements: { edges: [] },
      },
    })
    const out = await hydrateFeedEvents(events)
    expect(out[0].payload?.kind).toBe("cert.create")
    expect(out[1].payload).toBeNull()
  })

  it("includes the collection.value.type from the hydration payload", async () => {
    const events = [makeEvent("collection.create", "a")]
    respondWith({
      data: {
        activities: { edges: [] },
        collections: {
          edges: [
            {
              node: {
                uri: events[0].subjectUri,
                cid: "c1",
                did: "did:plc:x",
                title: "List",
                shortDescription: "",
                createdAt: "2026-05-26T00:00:00.000Z",
                type: "endorsement-list",
                items: null,
                banner: null,
              },
            },
          ],
        },
        badgeAwards: { edges: [] },
        legacyEndorsements: { edges: [] },
      },
    })
    const out = await hydrateFeedEvents(events)
    const payload = out[0].payload
    if (payload?.kind === "collection.create") {
      expect(payload.record.value.type).toBe("endorsement-list")
    } else {
      throw new Error("Expected collection.create payload")
    }
  })
})
