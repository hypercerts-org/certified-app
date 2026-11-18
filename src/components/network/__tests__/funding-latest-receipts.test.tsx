import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import {
  BUCKET_OTHER,
  BUCKET_TRUSTED,
  sourceBucket,
  type FundingDataset,
} from "@/lib/funding/dataset-types"
import { GAINFOREST_DID, MA_EARTH_DID } from "@/lib/funding/trusted-sources"

// Funding's "Latest receipts" (under every view but Receipts): its link to
// every receipt reads as the other "All ..." links do (P2-14), and the
// ledger's When cell keeps the day and the time apart so the narrow
// 800-1099px column can stack them (P2-7).

const nav = vi.hoisted(() => ({ search: "view=flow", path: "/funding", replace: vi.fn(), push: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
  useRegisterPageHeader: () => {},
}))

vi.mock("@/lib/feedback-context", () => ({
  useFeedback: () => ({ openFeedback: vi.fn() }),
}))

// The views themselves draw charts; this test is about the page around them.
vi.mock("../funding/funding-flow", () => ({ default: () => <div>Flow view</div> }))
vi.mock("../funding/funding-mosaic", () => ({ default: () => <div>Projects view</div> }))
vi.mock("@/components/explore-page/funding-receipt-parts", () => ({
  HydratedIdentityRow: ({ did }: { did: string }) => <span>{did}</span>,
  FundingForTarget: () => null,
}))

const T = Date.UTC(2026, 10, 12, 14, 5) / 1000

function dataset(): FundingDataset {
  return {
    builtAt: "2026-11-15T00:00:00.000Z",
    sources: [
      { did: MA_EARTH_DID, name: "Ma Earth", count: 1 },
      { did: GAINFOREST_DID, name: "GainForest", count: 1 },
    ],
    currencies: ["USD"],
    authors: [GAINFOREST_DID, MA_EARTH_DID, "did:plc:bot"],
    accounts: [{ did: "did:plc:org", name: "River Trust", avatar: null }],
    donors: [],
    projects: [
      {
        uri: "at://did:plc:org/org.hypercerts.collection/p1",
        owner: 0,
        title: "Mangroves",
        banner: null,
        avatar: null,
        lat: null,
        lng: null,
        place: null,
      },
    ],
    // Newest first: GainForest's, Ma Earth's, then another publisher's.
    receipts: {
      rkey: ["r1", "r2", "r3"],
      author: [0, 1, 2],
      t: [T, T - 3600, T - 7200],
      amount: [25, 40, 5],
      currency: [0, 0, 0],
      project: [0, 0, 0],
      to: [0, 0, 0],
      from: [-1, -1, -1],
      buckets: [
        BUCKET_TRUSTED | sourceBucket(GAINFOREST_DID),
        BUCKET_TRUSTED | sourceBucket(MA_EARTH_DID),
        BUCKET_OTHER,
      ],
    },
    toText: {},
    fromText: {},
    forUri: {},
    attestations: {},
    partial: false,
  } as unknown as FundingDataset
}

vi.mock("@/hooks/use-funding-dataset", () => ({
  useFundingDataset: () => ({ data: dataset(), error: null, retry: vi.fn() }),
}))

beforeEach(() => {
  nav.search = "view=flow"
  nav.replace.mockClear()
  nav.push.mockClear()
})

describe("Funding: Latest receipts", () => {
  it("links to every receipt as the other All links do, keeping the page's choices", async () => {
    nav.search = "view=flow&sizes=10-50-250"
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    const section = screen.getByRole("region", { name: "Latest receipts" })
    const all = within(section).getByRole("link", { name: "All receipts" })
    expect(all).toHaveAttribute("href", "/funding?view=receipts&sizes=10-50-250")
    // The shared SeeAllLink: a chevron, no underline.
    expect(all.querySelector("svg")).not.toBeNull()
    expect(all.className).toContain("no-underline")
    expect(screen.queryByRole("button", { name: "See all receipts" })).toBeNull()
  })

  it("keeps the day and the time apart in the When cell", async () => {
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    const time = screen.getByRole("list", { name: "Latest funding receipts" }).querySelector("time")!
    expect(time.querySelector(".funding-ledger__date")).toHaveTextContent("Nov 12")
    expect(time.textContent).toBe("Nov 12 · 14:05")
  })

  it("names the source that recorded each receipt, and hides other publishers by default", async () => {
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    const rows = within(screen.getByRole("list", { name: "Latest funding receipts" })).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector(".funding-ledger__by")).toHaveTextContent("GainForest")
    expect(rows[1].querySelector(".funding-ledger__by")).toHaveTextContent("Ma Earth")
  })

  it("lists each trusted source as its own Confirmed by chip, both on by default", async () => {
    const { default: FundingPage } = await import("../funding-page")
    render(<FundingPage />)
    const [chips] = screen.getAllByRole("group", { name: "Confirmed by" })
    const buttons = within(chips).getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Ma Earth1",
      "GainForest1",
      "Both sides0",
      "Funder only0",
      "Recipient only0",
      "Other publishers1",
    ])
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
      "false",
      "false",
      "false",
    ])
    expect(
      screen.getAllByText(/^Showing 2 receipts recorded by Ma Earth and GainForest, or confirmed by both sides\.$/)
        .length,
    ).toBeGreaterThan(0)
  })

})
