import { describe, it, expect, vi } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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

/** Gives the sidebar a scroll geometry jsdom doesn't lay out. */
function setScroll(
  el: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  for (const [key, value] of Object.entries(geometry)) {
    Object.defineProperty(el, key, { configurable: true, value })
  }
}

/**
 * Audit GP5: from 1100px the sidebar scrolls inside the graph row, and the
 * last ranking row was cut mid-handle with no cue. While more is below, the
 * sidebar carries `data-more-below` (a fade at its bottom edge); once
 * scrolled to the end, it doesn't.
 */
describe("EndorsementStats fade", () => {
  it("has no fade when everything fits", () => {
    render(<EndorsementStats graph={graph} onFocus={() => {}} />)
    expect(screen.getByRole("complementary")).not.toHaveAttribute("data-more-below")
  })

  it("fades the bottom edge while more is below, not once scrolled to the end", () => {
    render(<EndorsementStats graph={graph} onFocus={() => {}} />)
    const aside = screen.getByRole("complementary")

    setScroll(aside, { scrollHeight: 900, clientHeight: 600, scrollTop: 0 })
    fireEvent.scroll(aside)
    expect(aside).toHaveAttribute("data-more-below")

    setScroll(aside, { scrollHeight: 900, clientHeight: 600, scrollTop: 150 })
    fireEvent.scroll(aside)
    expect(aside).toHaveAttribute("data-more-below")

    // At the end (allowing a fractional scroll position).
    setScroll(aside, { scrollHeight: 900, clientHeight: 600, scrollTop: 299.5 })
    fireEvent.scroll(aside)
    expect(aside).not.toHaveAttribute("data-more-below")

    // Back up: the fade returns.
    setScroll(aside, { scrollHeight: 900, clientHeight: 600, scrollTop: 100 })
    fireEvent.scroll(aside)
    expect(aside).toHaveAttribute("data-more-below")
  })

  it("is a token mask, so it suits every style and both themes", () => {
    const css = readFileSync(join(__dirname, "../../../app/styles/visualization.css"), "utf8")
    const rule = css.slice(css.indexOf(".viz__sidebar[data-more-below] {"))
    const body = rule.slice(0, rule.indexOf("}"))
    expect(body).toContain("mask-image: linear-gradient(to bottom, var(--mask-opaque)")
    expect(body).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i)
  })
})
