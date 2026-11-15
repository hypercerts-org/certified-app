import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchAllFundingReceiptsFor } from "../indexer"
import { visibleDetailTabs, PROJECT_DETAIL_TABS } from "@/lib/detail-tabs"

/**
 * A record's funding is read to the end, page by page: a project funded
 * through a round has hundreds of receipts and its total must count them
 * all (the proxy caps a page at 100).
 */

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function page(n: number, from: number, hasNextPage: boolean) {
  return new Response(
    JSON.stringify({
      data: {
        orgHypercertsFundingReceipt: {
          totalCount: 250,
          pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor-${from + n}` : null },
          edges: Array.from({ length: n }, (_, i) => ({
            cursor: `c${from + i}`,
            node: {
              uri: `at://did:plc:x/org.hypercerts.funding.receipt/r${from + i}`,
              cid: "c",
              did: "did:plc:x",
              createdAt: null,
              occurredAt: null,
              amount: "1",
              currency: "USD",
              from: null,
              to: null,
              for: { uri: "at://did:plc:p/org.hypercerts.collection/p", cid: "c" },
              paymentRail: null,
              paymentNetwork: null,
              transactionId: null,
              notes: null,
            },
          })),
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

describe("fetchAllFundingReceiptsFor", () => {
  it("follows the cursor to the last page", async () => {
    mockFetch
      .mockResolvedValueOnce(page(100, 0, true))
      .mockResolvedValueOnce(page(100, 100, true))
      .mockResolvedValueOnce(page(50, 200, false))

    const result = await fetchAllFundingReceiptsFor(
      "at://did:plc:p/org.hypercerts.collection/p",
    )

    expect(result.records).toHaveLength(250)
    expect(result.complete).toBe(true)
    expect(result.totalCount).toBe(250)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const second = JSON.parse(mockFetch.mock.calls[1][1].body as string)
    expect(second.variables.after).toBe("cursor-100")
    expect(second.variables.first).toBe(100)
  })

  it("stops after the page limit and says it isn't complete", async () => {
    mockFetch.mockImplementation(async () => page(100, 0, true))
    const result = await fetchAllFundingReceiptsFor("at://p", { maxPages: 2 })
    expect(result.records).toHaveLength(200)
    expect(result.complete).toBe(false)
  })
})

describe("visibleDetailTabs", () => {
  it("keeps Overview, the tabs with something in them, and the open one", () => {
    const keys = (active: string, visible: Record<string, boolean>) =>
      visibleDetailTabs(PROJECT_DETAIL_TABS, visible, active).map((t) => t.key)

    expect(keys("overview", { activities: true, funding: false, updates: false })).toEqual([
      "overview",
      "activities",
    ])
    // A shared ?tab=funding link still opens Funding while it loads.
    expect(keys("funding", { activities: true })).toEqual(["overview", "activities", "funding"])
  })
})
