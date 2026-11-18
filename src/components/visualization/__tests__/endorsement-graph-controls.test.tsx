import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import type { EndorsementGraph as EndorsementGraphData, GraphNode } from "@/hooks/use-endorsement-graph"

// The canvas itself is out of scope here (and needs a real canvas); these
// tests cover the floating controls and the filtered stats they emit.
vi.mock("react-force-graph-2d", () => ({ default: () => null }))
vi.mock("@/hooks/use-trusted-evaluators", () => ({
  useTrustedEvaluators: () => ({ evaluatorDids: [], isLoading: false }),
}))

// Desktop (>=800px) unless a test says otherwise; also drives the
// Filters sheet's sheet-or-dialog choice.
const bp = vi.hoisted(() => ({ isDesktop: true, hasRightRail: null as boolean | null }))
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({
    isDesktop: bp.isDesktop,
    hasRightRail: bp.hasRightRail ?? bp.isDesktop,
    isFullDesktop: bp.isDesktop,
    isStandalone: false,
  }),
}))

beforeEach(() => {
  bp.isDesktop = true
  bp.hasRightRail = null
})

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

// a <-> b endorse each other; c -> a is one-way; d awards a; p gives a a
// participation badge (hidden until Participation is checked).
const nodes = ["a", "b", "c", "d", "p"].map(node)
const links = [
  { source: "a", target: "b", kind: "endorsement" as const, mutual: true },
  { source: "b", target: "a", kind: "endorsement" as const, mutual: true },
  { source: "c", target: "a", kind: "endorsement" as const, mutual: false },
  { source: "d", target: "a", kind: "award" as const, mutual: false },
  { source: "p", target: "a", kind: "participation" as const, mutual: false },
]

function renderGraph(focusReq: { did: string | null; nonce: number } = { did: null, nonce: 0 }) {
  const onStats = vi.fn<(s: EndorsementGraphData) => void>()
  render(
    <EndorsementGraph
      nodes={nodes}
      links={links}
      focusReq={focusReq}
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

  it("sits with the kind checkboxes in the labelled Lines row", () => {
    renderGraph()
    const lines = screen.getByRole("group", { name: "Lines" })
    expect(lines.querySelectorAll('input[type="checkbox"]')).toHaveLength(6)
    expect(lines).toContainElement(screen.getByRole("checkbox", { name: "Mutual only" }))
  })

  it("has a checkbox per badge kind, only Endorsements and Awards on at first", () => {
    renderGraph()
    for (const name of ["Endorsements", "Awards"]) {
      expect(screen.getByRole("checkbox", { name })).toBeChecked()
    }
    for (const name of ["Recognitions", "Certifications", "Participation"]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked()
    }
  })

  it("adds participation lines, and the accounts they bring, when checked", () => {
    const { last } = renderGraph()
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"])
    expect(last().totalOtherBadges).toBe(1)

    fireEvent.click(screen.getByRole("checkbox", { name: "Participation" }))
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d", "p"])
    expect(last().totalOtherBadges).toBe(2)
    // Participation is not an endorsement: the endorsement counts stay.
    expect(last().totalEndorsements).toBe(3)
  })

  it("keeps every control and the key in one panel (audit GP3)", () => {
    renderGraph()
    const panel = screen.getByRole("group", { name: "Graph controls" })
    expect(panel).toContainElement(screen.getByRole("combobox", { name: /find an account/i }))
    expect(panel).toContainElement(screen.getByRole("radiogroup", { name: "Graph layout" }))
    expect(panel).toContainElement(screen.getByRole("radiogroup", { name: "Show accounts" }))
    expect(panel.querySelector(".viz__legend")).not.toBeNull()
  })
})

describe("EndorsementGraph names", () => {
  it("names the scopes Trusted endorsers and Everyone, Trusted endorsers first", () => {
    renderGraph()
    const show = screen.getByRole("radiogroup", { name: "Show accounts" })
    const options = within(show).getAllByRole("radio")
    expect(options.map((o) => o.textContent)).toEqual(["Trusted endorsers", "Everyone"])
    expect(options[0]).toHaveAttribute("aria-checked", "true")
  })
})

/**
 * NET-04 / NET-09: a ranking row asks the graph to focus an account
 * (`focusReq`); its card opens expanded, and "View profile" stays in this
 * tab.
 */
describe("EndorsementGraph account card", () => {
  it("opens expanded when a ranking row focuses an account", () => {
    renderGraph({ did: "a", nonce: 1 })
    expect(screen.getByRole("button", { name: "Collapse details" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByText("Endorsed by")).toBeTruthy()
  })

  it("links View profile in the same tab, with no outward arrow", () => {
    renderGraph({ did: "a", nonce: 1 })
    const link = screen.getByRole("link", { name: "View profile" })
    expect(link).not.toHaveAttribute("target")
    expect(link).not.toHaveAttribute("rel")
    expect(link.querySelector("svg")).toBeNull()
  })
})

/**
 * NET-02: on phones the graph comes first. Above it only the find field
 * and a Filters button; Layout, Show and Lines open in a bottom sheet,
 * whose button counts the settings that differ from the defaults.
 */
describe("EndorsementGraph on phones", () => {
  it("keeps find in the page and puts Layout, Show and Lines in the Filters sheet", () => {
    bp.isDesktop = false
    renderGraph()
    expect(screen.getByRole("combobox", { name: /find an account/i })).toBeTruthy()
    expect(screen.queryByRole("radiogroup", { name: "Graph layout" })).toBeNull()
    expect(screen.queryByRole("checkbox", { name: "Mutual only" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    const sheet = screen.getByRole("dialog", { name: "Filters" })
    expect(within(sheet).getByRole("radiogroup", { name: "Graph layout" })).toBeTruthy()
    expect(within(sheet).getByRole("radiogroup", { name: "Show accounts" })).toBeTruthy()
    expect(within(sheet).getByRole("group", { name: "Lines" })).toBeTruthy()
  })

  it("counts changed filters on the button and resets them", () => {
    bp.isDesktop = false
    const { last } = renderGraph()
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    const sheet = screen.getByRole("dialog", { name: "Filters" })
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Mutual only" }))
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Participation" }))
    expect(screen.getByRole("button", { name: "Filters, 2 changed" })).toBeTruthy()
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b"])

    fireEvent.click(within(sheet).getByRole("button", { name: "Reset" }))
    expect(within(sheet).getByRole("checkbox", { name: "Mutual only" })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy()
    expect(last().nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"])
  })
})

// 800-1099px (the rail layout) takes the phone pattern: the find field and
// a Filters button above the graph, the rest in the sheet, so the graph
// starts near the top instead of under a tall panel.
describe("EndorsementGraph controls, 800-1099px", () => {
  it("is a find + Filters row, not the panel of rows", () => {
    bp.isDesktop = true
    bp.hasRightRail = false
    renderGraph()
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument()
    expect(screen.queryByRole("radiogroup", { name: "Graph layout" })).toBeNull()
    expect(screen.queryByRole("checkbox", { name: "Mutual only" })).toBeNull()
  })
})

// Phones: the selected account's card sits under the graph (its slot),
// part of the page, never over the graph.
describe("EndorsementGraph account card, phones", () => {
  it("goes in the slot under the graph when there is one, not over it", () => {
    bp.isDesktop = false
    const slot = document.createElement("div")
    document.body.appendChild(slot)
    render(
      <EndorsementGraph
        nodes={nodes}
        links={links}
        focusReq={{ did: "a", nonce: 1 }}
        panelHost={slot}
      />,
    )
    const card = slot.querySelector(".viz__panel")
    expect(card).not.toBeNull()
    expect(card).toHaveClass("viz__panel--docked")
    expect(document.querySelector(".viz__canvas-host .viz__panel")).toBeNull()
    slot.remove()
  })
})
