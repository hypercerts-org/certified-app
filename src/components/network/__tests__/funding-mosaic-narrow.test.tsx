import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import type { ProjectTotal } from "@/lib/funding/select"

// Funding > Projects, narrow (a phone): no room beside the cards, so a
// picked card's funding opens in a sheet over the page (the reader stays
// where they picked it), and the projects past the first cards are a
// "Show the other N projects" list of rows (name and amount), not a strip
// of tiny marks.

vi.mock("../funding/use-element-width", () => ({
  useElementWidth: () => [() => {}, 400],
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/funding",
}))

import FundingMosaic from "../funding/funding-mosaic"

const N = 26

function dataset(): FundingDataset {
  return {
    builtAt: "2026-11-15T00:00:00.000Z",
    sources: [],
    currencies: ["USD"],
    authors: [],
    accounts: Array.from({ length: N }, (_, i) => ({ did: `did:plc:o${i}`, name: `Owner ${i}`, avatar: null })),
    donors: [],
    projects: Array.from({ length: N }, (_, i) => ({
      uri: `at://did:plc:o${i}/org.hypercerts.collection/p${i}`,
      owner: i,
      title: `Project ${i}`,
      banner: null,
      avatar: null,
      lat: null,
      lng: null,
      place: null,
    })),
    receipts: { rkey: [], author: [], t: [], amount: [], currency: [], project: [], to: [], from: [], buckets: [] },
    toText: {},
    fromText: {},
    forUri: {},
    attestations: {},
    partial: false,
  }
}

const totals: ProjectTotal[] = Array.from({ length: N }, (_, i) => ({
  project: i,
  total: (N - i) * 1000,
  count: 3,
  donors: 2,
  anonymous: 1,
  first: 0,
  last: 0,
})) as unknown as ProjectTotal[]

function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as unknown as { __polyfilled?: boolean } & HTMLDialogElement
  if (proto.__polyfilled) return
  proto.__polyfilled = true
  proto.showModal = function () {
    ;(this as unknown as { open: boolean }).open = true
  }
  proto.close = function () {
    ;(this as unknown as { open: boolean }).open = false
  }
}

beforeEach(() => polyfillDialog())
afterEach(() => cleanup())

function renderMosaic(onSelect = vi.fn()) {
  render(
    <FundingMosaic ds={dataset()} totals={totals} idx={[]} selected={-1} onSelect={onSelect} onShowReceipts={vi.fn()} />,
  )
  return onSelect
}

describe("FundingMosaic, narrow", () => {
  it("has no panel in the page until a card is picked, then shows it in a sheet", () => {
    const onSelect = renderMosaic()
    expect(screen.queryByRole("complementary", { name: "Selected project" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Owner 1\b/ }))
    expect(onSelect).toHaveBeenCalledWith(1)
    expect(screen.getByRole("complementary", { name: "Selected project" })).toBeInTheDocument()
  })

  it("puts the other projects behind a button, then lists them as rows", () => {
    renderMosaic()
    // No strip of marks.
    expect(document.querySelector(".funding-mosaic__tail")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show the other 2 projects" }))
    const list = document.querySelector<HTMLElement>(".funding-mosaic__tail-list")!
    const rows = within(list).getAllByRole("button")
    // Name and amount, largest first.
    expect(rows.map((r) => [
      r.querySelector(".funding-mosaic__tail-name")?.textContent,
      r.querySelector(".funding-mosaic__tail-amount")?.textContent,
    ])).toEqual([
      ["Owner 24", "$2,000"],
      ["Owner 25", "$1,000"],
    ])
    // The button that showed them is gone: the first row has focus.
    expect(rows[0]).toHaveFocus()
  })
})
