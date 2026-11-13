import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { EndorsementGraph as EndorsementGraphData, GraphNode } from "@/hooks/use-endorsement-graph"

// The canvas itself is out of scope here (and needs a real canvas); these
// tests cover the floating controls and the filtered stats they emit.
vi.mock("react-force-graph-2d", () => ({ default: () => null }))
vi.mock("@/hooks/use-trusted-evaluators", () => ({
  useTrustedEvaluators: () => ({ evaluatorDids: [], isLoading: false }),
}))

import EndorsementGraph from "../endorsement-graph"

beforeAll(() => {
  // jsdom has no ResizeObserver; the graph sizes its canvas with one. A
  // stub that never fires keeps the canvas unmounted.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

function node(id: string): GraphNode {
  return { id, handle: `${id}.example`, displayName: id, avatarUrl: null, given: 0, received: 0, mutual: 0 }
}

// a <-> b endorse each other; c -> a is one-way; d awards a.
const nodes = ["a", "b", "c", "d"].map(node)
const links = [
  { source: "a", target: "b", kind: "endorsement" as const, mutual: true },
  { source: "b", target: "a", kind: "endorsement" as const, mutual: true },
  { source: "c", target: "a", kind: "endorsement" as const, mutual: false },
  { source: "d", target: "a", kind: "award" as const, mutual: false },
]

function renderGraph() {
  const onStats = vi.fn<(s: EndorsementGraphData) => void>()
  render(
    <EndorsementGraph
      nodes={nodes}
      links={links}
      focusReq={{ did: null, nonce: 0 }}
      onStats={onStats}
    />,
  )
  const last = () => onStats.mock.calls.at(-1)![0]
  return { last }
}

/**
 * Audit GP4: "Mutual only" toggles a state, so it is a checkbox like the
 * Endorsements / Awards toggles beside it, not an outline button that
 * reads as an action. Same state and behaviour as the button had.
 */
describe("EndorsementGraph controls", () => {
  it("shows Mutual only as an unchecked checkbox with a visible label", () => {
    renderGraph()
    const mutual = screen.getByRole("checkbox", { name: "Mutual only" })
    expect(mutual).not.toBeChecked()
    expect(screen.getByText("Mutual only").tagName).toBe("LABEL")
    expect(screen.queryByRole("button", { name: "Mutual only" })).toBeNull()
  })

  it("keeps only the mutual pairs while checked, and restores the graph when unchecked", () => {
    const { last } = renderGraph()
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"])

    const mutual = screen.getByRole("checkbox", { name: "Mutual only" })
    fireEvent.click(mutual)
    expect(mutual).toBeChecked()
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b"])
    expect(last().totalAwards).toBe(0)
    expect(last().mutualPairs).toBe(1)

    fireEvent.click(mutual)
    expect(mutual).not.toBeChecked()
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"])
  })

  it("sits with the kind checkboxes in one filter card", () => {
    renderGraph()
    const card = screen.getByRole("checkbox", { name: "Mutual only" }).closest(".viz__kind-toggles")
    expect(card).not.toBeNull()
    expect(card!.querySelectorAll('input[type="checkbox"]')).toHaveLength(3)
  })
})
