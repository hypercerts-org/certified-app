import { describe, it, expect } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import type { ProjectTotal } from "@/lib/funding/select"
import { TileImage } from "../funding/funding-mosaic"

// A project tile shows the project's banner photo; a banner that fails to
// load falls back to the tile's avatar mark (the same mark a project
// without a banner gets), never the browser's broken-image icon.

function dataset(banner: string | null): FundingDataset {
  return {
    builtAt: "2026-11-15T00:00:00.000Z",
    sources: [],
    currencies: ["USD"],
    authors: [],
    accounts: [{ did: "did:plc:owner", name: "Go Eco", avatar: null }],
    donors: [],
    projects: [
      {
        uri: "at://did:plc:owner/org.hypercerts.collection/p1",
        owner: 0,
        title: "Wetlands",
        banner,
        avatar: null,
        lat: null,
        lng: null,
        place: null,
      },
    ],
    receipts: { rkey: [], author: [], t: [], amount: [], currency: [], project: [], to: [], from: [], buckets: [] },
    toText: {},
    fromText: {},
    forUri: {},
    attestations: {},
    partial: false,
  }
}

const t = { project: 0 } as ProjectTotal

describe("funding tile image", () => {
  it("shows the banner photo while it loads", () => {
    const { container } = render(<TileImage ds={dataset("https://example.test/b.jpg")} t={t} />)
    expect(container.querySelector("img.funding-tile__photo")).not.toBeNull()
    expect(container.querySelector(".funding-tile__mark")).toBeNull()
  })

  it("falls back to the avatar mark when the banner fails to load", () => {
    const { container } = render(<TileImage ds={dataset("https://example.test/broken.jpg")} t={t} />)
    fireEvent.error(container.querySelector("img.funding-tile__photo")!)
    expect(container.querySelector("img.funding-tile__photo")).toBeNull()
    const mark = container.querySelector(".funding-tile__mark")
    expect(mark).not.toBeNull()
    // The mark is the initials avatar of the owner ("Go Eco" -> "GE").
    expect(mark?.querySelector('[data-centerpiece="avatar"]')?.textContent).toBe("GE")
  })

  it("uses the avatar mark when there is no banner", () => {
    const { container } = render(<TileImage ds={dataset(null)} t={t} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector(".funding-tile__mark")).not.toBeNull()
  })
})
