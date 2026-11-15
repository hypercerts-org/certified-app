import { describe, expect, it, vi, afterEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { FundingReceipt } from "@/lib/atproto/indexer"
import { MA_EARTH_DID } from "@/lib/funding/trusted-sources"

// A record page's Funding card and tab, as a visitor sees them.

vi.mock("next/navigation", () => ({
  usePathname: () => "/org.test/activity/a1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: [] }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string) => ({
    info: { did, handle: "1ane6o.certified.one", displayName: "Barbara Choat", avatarUrl: null },
    isLoading: false,
  }),
}))

vi.mock("@/hooks/use-trusted-evaluators", () => ({
  useTrustedEvaluators: () => ({ evaluatorDids: [MA_EARTH_DID], isLoading: false }),
}))

let receipts: FundingReceipt[] = []
vi.mock("@/hooks/use-record-funding", () => ({
  useRecordFunding: () => ({
    receipts,
    isLoading: false,
    error: null,
    complete: true,
    refetch: () => {},
  }),
}))

import {
  FundingFactCard,
  RecordFundingSection,
  useRecordFundingView,
} from "../record-funding"

const ME = "did:plc:org"

function receipt(n: number, over: Partial<FundingReceipt> = {}): FundingReceipt {
  return {
    uri: `at://did:plc:x/org.hypercerts.funding.receipt/${n}`,
    cid: "c",
    did: MA_EARTH_DID,
    createdAt: null,
    occurredAt: `2026-07-2${n}T00:00:00Z`,
    amount: "50.00",
    currency: "USD",
    from: { kind: "account", did: `did:plc:funder${n}` },
    to: { kind: "account", did: ME },
    forUri: null,
    forCid: null,
    paymentRail: null,
    paymentNetwork: null,
    transactionId: null,
    notes: null,
    matchingReceipt: null,
    attestations: [{ role: "third-party", did: MA_EARTH_DID }],
    ...over,
  }
}

function Page() {
  const view = useRecordFundingView(["at://did:plc:org/org.hypercerts.claim.activity/a1"], null)
  return (
    <>
      <FundingFactCard view={view} href="/org.test/activity/a1?tab=funding" />
      <RecordFundingSection view={view} recipientDid={ME} />
      <p data-testid="count">{view.tabCount}</p>
    </>
  )
}

afterEach(() => {
  cleanup()
  receipts = []
})

describe("RecordFundingSection", () => {
  it("reads amounts like the total and leaves out a Confirmed by column that says one thing", () => {
    receipts = [receipt(1), receipt(2, { amount: "5.5" })]
    render(<Page />)
    expect(screen.getByText("$50")).toBeTruthy()
    expect(screen.getByText("$5.50")).toBeTruthy()
    expect(screen.queryByText("50.00")).toBeNull()
    // Every gift was recorded by Ma Earth: the sentence above says so.
    expect(screen.queryByText("Confirmed by", { selector: ".funding-receipt-row__heading" })).toBeNull()
    // Names, not machine handles.
    expect(screen.getAllByText("Barbara Choat").length).toBeGreaterThan(0)
    expect(screen.queryByText(/1ane6o/)).toBeNull()
  })

  it("lists gifts nobody confirmed yet, marked, with a count, instead of an empty tab", () => {
    receipts = [
      receipt(1, { did: "did:plc:funder1", attestations: [{ role: "sender", did: "did:plc:funder1" }] }),
    ]
    render(<Page />)
    // The card and the tab say it the short way.
    expect(screen.getAllByText("1 unconfirmed gift").length).toBe(2)
    expect(screen.queryByText(/No confirmed gifts yet/)).toBeNull()
    expect(screen.getByText("Unconfirmed")).toBeTruthy()
    expect(screen.getByTestId("count").textContent).toBe("1")
  })
})
