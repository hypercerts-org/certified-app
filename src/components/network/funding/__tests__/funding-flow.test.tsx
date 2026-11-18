import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import FundingFlow from "../funding-flow"
import {
  BUCKET_BOTH,
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_TRUSTED,
  sourceBucket,
  type FundingDataset,
} from "@/lib/funding/dataset-types"
import { DEFAULT_GIFT_BOUNDS, projectTotals } from "@/lib/funding/select"
import { GAINFOREST_DID, MA_EARTH_DID } from "@/lib/funding/trusted-sources"

const url = { to: "regions" }
const bp = { isDesktop: true }

vi.mock("@/hooks/use-url-param", () => ({
  useUrlParam: () => [url.to, vi.fn()],
}))
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({
    isDesktop: bp.isDesktop,
    hasRightRail: bp.isDesktop,
    isFullDesktop: bp.isDesktop,
    isStandalone: false,
  }),
}))
vi.mock("@/hooks/use-overflow-edges", () => ({
  useOverflowEdges: () => ({ start: false, end: false }),
}))

const DAY = 86_400
const MA_EARTH = BUCKET_TRUSTED | sourceBucket(MA_EARTH_DID)
const GAINFOREST = BUCKET_TRUSTED | sourceBucket(GAINFOREST_DID)

/** USD gifts: two to "Forest" (has a location), one to "Reef" (no
 *  location), one GainForest gift with no project; plus one USDC payment,
 *  which the chart never counts. */
function dataset(): FundingDataset {
  return {
    builtAt: "2026-11-18T00:00:00Z",
    sources: [
      { did: MA_EARTH_DID, name: "Ma Earth", count: 2 },
      { did: GAINFOREST_DID, name: "GainForest", count: 1 },
    ],
    currencies: ["USD", "USDC"],
    authors: [MA_EARTH_DID, "did:plc:org", "did:plc:bot", GAINFOREST_DID],
    accounts: [
      { did: "did:plc:org", name: "Trees", avatar: null },
      { did: "did:plc:org2", name: "Reefs", avatar: null },
    ],
    donors: ["did:plc:donor"],
    projects: [
      { uri: "at://did:plc:org/org.hypercerts.collection/a", owner: 0, title: "Forest", banner: null, avatar: null, lat: 10, lng: -70, place: null },
      { uri: "at://did:plc:org2/org.hypercerts.collection/b", owner: 1, title: "Reef", banner: null, avatar: null, lat: null, lng: null, place: null },
    ],
    receipts: {
      rkey: ["r4", "r3", "r2", "r1", "g1"],
      author: [2, 1, 0, 0, 3],
      t: [10 * DAY, 9 * DAY, 2 * DAY + 60, 2 * DAY, 1 * DAY],
      amount: [5, 1500, 20, 30, 10],
      currency: [1, 0, 0, 0, 0],
      project: [-1, 1, 0, 0, -1],
      to: [-1, 1, 0, 0, -1],
      from: [-2, 0, -1, 0, -1],
      buckets: [BUCKET_OTHER, BUCKET_BOTH, MA_EARTH, MA_EARTH | BUCKET_RECIPIENT, GAINFOREST],
    },
    toText: {},
    fromText: {},
    forUri: {},
    attestations: {},
    partial: false,
  }
}

function renderFlow() {
  const ds = dataset()
  const idx = [0, 1, 2, 3, 4]
  return render(
    <FundingFlow
      ds={ds}
      idx={idx}
      totals={projectTotals(ds, idx)}
      bounds={[...DEFAULT_GIFT_BOUNDS]}
      onBoundsChange={vi.fn()}
    />,
  )
}

describe("FundingFlow: gifts with nowhere to go", () => {
  beforeEach(() => {
    url.to = "regions"
    bp.isDesktop = true
  })

  it("leaves gifts without a location out of the regions chart and counts them", () => {
    const { container } = renderFlow()
    expect(screen.getByText(/have no location yet, so they aren't in the chart/)).toBeInTheDocument()
    expect(container.querySelector(".funding-flow__left-out")?.textContent).toContain("2 gifts")
    expect(container.textContent).not.toContain("No location yet")
    // Only what was charted is named: GainForest's one gift had no project.
    expect(container.textContent).not.toContain("GainForest")
  })

  it("leaves gifts without a project out of the projects chart and counts them", () => {
    url.to = "projects"
    const { container } = renderFlow()
    expect(screen.getByText(/isn't for a specific project, so it isn't in the chart/)).toBeInTheDocument()
    expect(container.querySelector(".funding-flow__left-out")?.textContent).toContain("1 gift")
    expect(container.textContent).not.toContain("No project")
    expect(container.textContent).toContain("Reef")
  })

  it("says the same on phones", () => {
    bp.isDesktop = false
    renderFlow()
    expect(screen.getByText(/have no location yet, so they aren't in the chart/)).toBeInTheDocument()
  })
})
