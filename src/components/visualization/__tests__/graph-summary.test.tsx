import { describe, it, expect, vi } from "vitest"
import type { EndorsementGraph, GraphNode } from "@/hooks/use-endorsement-graph"

vi.mock("@/hooks/use-endorsement-graph", () => ({
  useEndorsementGraph: () => ({ graph: null, isLoading: true, error: null }),
}))

import { graphSummary } from "../visualization"

function graph(accounts: number, endorsements: number, mutualPairs: number): EndorsementGraph {
  const nodes: GraphNode[] = Array.from({ length: accounts }, (_, i) => ({
    id: `did:plc:n${i}`,
    handle: null,
    displayName: null,
    avatarUrl: null,
    given: 0,
    received: 0,
    mutual: 0,
  }))
  return {
    nodes,
    links: [],
    totalEndorsements: endorsements,
    totalAwards: 0,
    totalOtherBadges: 0,
    mutualPairs,
    truncated: false,
  }
}

/** NET-02: on phones the totals are one line above the graph. */
describe("graphSummary", () => {
  it("reads as one line of accounts, endorsements and mutual pairs", () => {
    expect(graphSummary(graph(205, 1258, 3))).toBe(
      `205 accounts · ${(1258).toLocaleString()} endorsements · 3 mutual pairs`,
    )
  })

  it("uses the singular for one", () => {
    expect(graphSummary(graph(1, 1, 1))).toBe("1 account · 1 endorsement · 1 mutual pair")
  })
})
