import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// The project page's tab strip and Overview, read-only (not owner). The
// search params are mutable per test so a deep link can be simulated.

let search = ""

vi.mock("next/navigation", () => ({
  usePathname: () => "/alice.test/project/proj1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: [], switchOrg: () => {} }),
}))

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: true }),
}))

vi.mock("@/hooks/use-project-items", () => ({
  useProjectItems: () => ({ resolutions: [], isLoading: false }),
}))

// Funding: the receipts read for the project and its activities. Mutable
// per test; the URIs it was asked for are recorded.
let fundingReceipts: unknown[] = []
const fundingCalls: string[][] = []
vi.mock("@/hooks/use-record-funding", () => ({
  useRecordFunding: (uris: string[]) => {
    fundingCalls.push([...uris])
    return {
      receipts: fundingReceipts,
      isLoading: false,
      error: null,
      complete: true,
      refetch: vi.fn(),
    }
  },
}))

// Two updates: the Updates tab counts them. The updates sections themselves
// are stubbed (their cards aren't under test).
vi.mock("@/hooks/use-context-updates", () => ({
  useContextUpdates: () => ({
    updates: [{ uri: "at://u/1" }, { uri: "at://u/2" }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    removeUpdate: vi.fn(),
  }),
}))

vi.mock("@/components/context/context-updates", () => ({
  default: () => null,
}))

import ProjectDetail from "../project-detail"
import type { CollectionValue } from "@/lib/atproto/collection"

const DID = "did:plc:abc"
const DESCRIPTION = "The full story of this project, at length."
const MA_EARTH = "did:plc:7ffezlhobzihdt3nbazysgvr"

const value = {
  title: "My project",
  shortDescription: "A short summary.",
  description: DESCRIPTION,
  items: [
    { itemIdentifier: { uri: "at://did:plc:abc/org.hypercerts.claim.activity/a1", cid: "c1" } },
    { itemIdentifier: { uri: "at://did:plc:abc/org.hypercerts.claim.activity/a2", cid: "c2" } },
    { itemIdentifier: { uri: "at://did:plc:abc/org.hypercerts.claim.activity/a3", cid: "c3" } },
  ],
} as unknown as CollectionValue

function receipt(n: number, amount: string, from: string | null) {
  return {
    uri: `at://${MA_EARTH}/org.hypercerts.funding.receipt/r${n}`,
    cid: `c${n}`,
    did: MA_EARTH,
    createdAt: `2026-11-0${n}T00:00:00Z`,
    occurredAt: `2026-11-0${n}T00:00:00Z`,
    amount,
    currency: "USD",
    from: from ? { kind: "account", did: from } : null,
    to: { kind: "account", did: DID },
    forUri: `at://${DID}/org.hypercerts.collection/proj1`,
    forCid: "x",
    paymentRail: null,
    paymentNetwork: null,
    transactionId: null,
    notes: null,
    matchingReceipt: null,
    attestations: [{ role: "third-party", did: MA_EARTH }],
  }
}

function renderProject() {
  return render(
    <ProjectDetail did={DID} rkey="proj1" value={value} cid="bafycid" handle={null} />,
  )
}

beforeEach(() => {
  cleanup()
  search = ""
  fundingReceipts = []
  fundingCalls.length = 0
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ProjectDetail tabs", () => {
  it("counts every list tab and hides Funding when there is none", () => {
    renderProject()
    const names = screen.getAllByRole("tab").map((t) => t.textContent?.trim())
    expect(names).toEqual(["Overview", "Activities 3", "Updates 2"])
  })

  it("adds a counted Funding tab when the project has gifts", () => {
    fundingReceipts = [receipt(1, "20.00", "did:plc:f1"), receipt(2, "5.50", null)]
    renderProject()
    const names = screen.getAllByRole("tab").map((t) => t.textContent?.trim())
    expect(names).toEqual(["Overview", "Activities 3", "Funding 2", "Updates 2"])
  })

  it("reads the funding of the project and of each of its activities", () => {
    renderProject()
    expect(fundingCalls[0]).toEqual([
      `at://${DID}/org.hypercerts.collection/proj1`,
      "at://did:plc:abc/org.hypercerts.claim.activity/a1",
      "at://did:plc:abc/org.hypercerts.claim.activity/a2",
      "at://did:plc:abc/org.hypercerts.claim.activity/a3",
    ])
  })

  it("shows the total, gifts and funders in the funding card", () => {
    fundingReceipts = [receipt(1, "20.00", "did:plc:f1"), receipt(2, "5.50", null)]
    renderProject()
    expect(screen.getByText("$26")).toBeTruthy()
    expect(screen.getByText("2 gifts from 1 funder and anonymous donors")).toBeTruthy()
    expect(screen.getByText("Ma Earth")).toBeTruthy()
  })

  it("shows the summary as the lead and the description in place", () => {
    renderProject()
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.getByText("A short summary.")).toBeTruthy()
    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Read full description" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Summary" })).toBeNull()
  })

  it("opens an old ?tab=description link on Overview", () => {
    search = "tab=description"
    renderProject()
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.queryByRole("tab", { name: /Description/ })).toBeNull()
    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
  })

  it("shares a link to the open tab, for any visitor", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    search = "tab=updates"
    renderProject()
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/${DID}/project/proj1?tab=updates`,
      ),
    )
  })
})
