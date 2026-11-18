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

// While the network loads (below 1100px) the totals line and the find +
// Filters row hold their place, so the graph doesn't move down when they
// arrive.
describe("Visualization while loading", () => {
  it("reserves the totals line and the find + Filters row", async () => {
    const { render } = await import("@testing-library/react")
    const { default: Visualization } = await import("../visualization")
    const { container } = render(<Visualization embedded />)
    expect(container.querySelector(".viz__summary--loading")).not.toBeNull()
    const row = container.querySelector(".viz__toolbar--placeholder")
    expect(row).not.toBeNull()
    expect(row).toHaveAttribute("aria-hidden", "true")
    expect(row!.querySelector("input")).toBeDisabled()
  })
})

// P1-5: the first load reads as Map's and Funding's do, and from 1100px the
// column beside the graph is there from the start instead of popping in.
describe("Visualization's first load", () => {
  it("says what it gathers and that it can take up to a minute", async () => {
    const { render, screen } = await import("@testing-library/react")
    const { default: Visualization } = await import("../visualization")
    render(<Visualization embedded />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Gathering every endorsement and badge on the network. The first load can take up to a minute.",
    )
  })

  // Rendered at every width (the CSS shows it from 1100px), so the server
  // render, before the width is known, already holds the column.
  it("holds the side column for 1100px and up: the controls panel's shape and the totals", async () => {
    const { render } = await import("@testing-library/react")
    const { default: Visualization } = await import("../visualization")
    const { container } = render(<Visualization embedded />)
    const panel = container.querySelector(".viz__controls--placeholder")!
    expect(panel).not.toBeNull()
    expect(panel).toHaveAttribute("aria-hidden", "true")
    expect(panel.querySelector("input")).toBeDisabled()
    // In the side column, after the slot the real controls fill (the CSS
    // hides it once that slot has content).
    const side = container.querySelector(".viz__side")!
    expect(side.contains(panel)).toBe(true)
    expect(
      side.querySelector(".viz__nav")!.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(container.querySelector(".viz__totals-placeholder")).toHaveAttribute("aria-hidden", "true")
  })
})
