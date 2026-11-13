import { describe, it, expect, vi } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"
import EndorsementStats from "../endorsement-stats"
import type { EndorsementGraph, GraphNode } from "@/hooks/use-endorsement-graph"

function node(i: number, given: number, received: number): GraphNode {
  return {
    id: `did:plc:node${i}`,
    handle: `node${i}.example`,
    displayName: `Node ${i}`,
    avatarUrl: null,
    given,
    received,
    mutual: 0,
  }
}

const graph: EndorsementGraph = {
  nodes: [node(1, 26, 3), node(2, 22, 0), node(3, 0, 17)],
  links: [],
  totalEndorsements: 1234,
  totalAwards: 10,
  mutualPairs: 0,
  truncated: false,
}

/**
 * Audit X10: the Graph sidebar uses the page primitives like every other
 * page: the totals are a <StatRow> (Inter numbers, no serif tiles) and the
 * rankings are titled by <SectionHeader> (`text-section`, never serif).
 */
describe("EndorsementStats", () => {
  it("shows the totals as a StatRow", () => {
    render(<EndorsementStats graph={graph} onFocus={() => {}} />)
    const totals = screen.getByRole("list", { name: "Network totals" })
    const items = within(totals).getAllByRole("listitem")
    expect(items.map((li) => li.textContent)).toEqual([
      `${(1234).toLocaleString()}Endorsements`,
      "10Awards",
      "3People",
      "0Mutual pairs",
      "0%Reciprocity",
    ])
    expect(document.querySelector(".viz__stat, .viz__stats-grid")).toBeNull()
  })

  it("titles each ranking with a SectionHeader, never the serif", () => {
    render(<EndorsementStats graph={graph} onFocus={() => {}} />)
    const heading = screen.getByRole("heading", { level: 2, name: "Top endorsers" })
    expect(heading.className).toContain("text-section")
    expect(heading.className).not.toContain("font-headline")
    // The section is named by its heading.
    expect(screen.getByRole("region", { name: "Most endorsed" })).toBeTruthy()
  })

  it("focuses an account in the graph from its ranking row", () => {
    const onFocus = vi.fn()
    render(<EndorsementStats graph={graph} onFocus={onFocus} />)
    const ranking = screen.getByRole("region", { name: "Top endorsers" })
    fireEvent.click(within(ranking).getByRole("button", { name: /Node 1/ }))
    expect(onFocus).toHaveBeenCalledWith("did:plc:node1")
  })
})
