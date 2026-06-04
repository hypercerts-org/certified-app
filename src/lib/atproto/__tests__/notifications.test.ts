import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseNotificationsPage } from "../notifications"

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
})
