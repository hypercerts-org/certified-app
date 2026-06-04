import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  parseNotificationsPage,
  fetchNotifications,
  fetchUnreadCount,
} from "../notifications"

/** Build a fully-populated, valid notification node. */
function validNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    reason: "endorsement",
    reasonSubject: null,
    sortAt: "2026-05-01T00:00:00.000Z",
    count: 3,
    latestRecordUri: "at://did:plc:abc/org.hypercerts.badge.award/rkey1",
    latestRecordCid: "bafyreiabc",
    latestAuthor: "did:plc:author",
    isRead: false,
    ...overrides,
  }
}

function pageWith(nodes: unknown[]) {
  return {
    data: {
      notifications: {
        edges: nodes.map((node, i) => ({ cursor: `c${i}`, node })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  } as Parameters<typeof parseNotificationsPage>[0]
}

describe("parseNotificationsPage — load-bearing field validation", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps a fully-populated edge", () => {
    const page = parseNotificationsPage(pageWith([validNode()]))
    expect(page.records).toHaveLength(1)
    expect(page.records[0].count).toBe(3)
    expect(page.records[0].latestRecordUri).toBe(
      "at://did:plc:abc/org.hypercerts.badge.award/rkey1",
    )
  })

  it("skips an edge missing the load-bearing count field", () => {
    const node = validNode()
    delete (node as Record<string, unknown>).count
    const page = parseNotificationsPage(pageWith([node]))
    expect(page.records).toHaveLength(0)
  })

  it("skips an edge missing latestRecordUri", () => {
    const node = validNode()
    delete (node as Record<string, unknown>).latestRecordUri
    const page = parseNotificationsPage(pageWith([node]))
    expect(page.records).toHaveLength(0)
  })

  it("skips an edge missing latestRecordCid", () => {
    const node = validNode()
    delete (node as Record<string, unknown>).latestRecordCid
    const page = parseNotificationsPage(pageWith([node]))
    expect(page.records).toHaveLength(0)
  })

  it("skips an edge missing latestAuthor", () => {
    const node = validNode()
    delete (node as Record<string, unknown>).latestAuthor
    const page = parseNotificationsPage(pageWith([node]))
    expect(page.records).toHaveLength(0)
  })

  it("keeps the valid edge and drops the partial one in a mixed page", () => {
    const partial = validNode({ id: "notif-2" })
    delete (partial as Record<string, unknown>).count
    const page = parseNotificationsPage(pageWith([validNode(), partial]))
    expect(page.records).toHaveLength(1)
    expect(page.records[0].id).toBe("notif-1")
  })

  it("passes through the aggregated `recipient` field", () => {
    const page = parseNotificationsPage(
      pageWith([validNode({ recipient: "did:plc:group" })]),
    )
    expect(page.records).toHaveLength(1)
    expect(page.records[0].recipient).toBe("did:plc:group")
  })
})

describe("recipients wiring — fetchNotifications / fetchUnreadCount", () => {
  let lastBody: { operationName?: string; variables?: Record<string, unknown> }

  beforeEach(() => {
    lastBody = {}
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        lastBody = JSON.parse((init?.body as string) ?? "{}")
        const op = lastBody.operationName
        const data =
          op === "unreadNotificationCount"
            ? { unreadNotificationCount: { count: 0, more: false } }
            : {
                notifications: {
                  edges: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              }
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("omits `recipients` from the body when none are passed", async () => {
    await fetchNotifications({ first: 10 })
    expect(lastBody.variables).toEqual({ first: 10, after: null })
    expect(lastBody.variables).not.toHaveProperty("recipients")
  })

  it("omits `recipients` when an empty array is passed", async () => {
    await fetchNotifications({ first: 10, recipients: [] })
    expect(lastBody.variables).not.toHaveProperty("recipients")
  })

  it("includes `recipients` in the notifications body when non-empty", async () => {
    await fetchNotifications({ first: 10, recipients: ["did:plc:me", "did:plc:grp"] })
    expect(lastBody.variables?.recipients).toEqual(["did:plc:me", "did:plc:grp"])
  })

  it("sends `recipients` for the unread count but omits it by default", async () => {
    await fetchUnreadCount()
    expect(lastBody.variables).toEqual({})
    await fetchUnreadCount(["did:plc:me", "did:plc:grp"])
    expect(lastBody.variables?.recipients).toEqual(["did:plc:me", "did:plc:grp"])
  })
})
