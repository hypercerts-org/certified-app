import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

type Stats = { inBoth: string[]; onlyCertified: string[]; onlyBluesky: string[] }
let stats: Stats = { inBoth: [], onlyCertified: [], onlyBluesky: [] }
let isLoading = false

vi.mock("@/hooks/use-social-graph-sync", () => ({
  useSocialGraphSync: () => ({
    certifiedCount: 0,
    blueskyCount: 0,
    stats,
    truncated: false,
    blueskyTruncated: false,
    isLoading,
    error: null,
    refetch: vi.fn(),
    reload: vi.fn(),
    importDids: vi.fn(),
    exportDids: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-author-info", () => ({ useAuthorInfo: () => ({ info: null }) }))

import SyncSocialGraphSection from "../sync-social-graph-section"

const dids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `did:plc:${p}${i}`)

describe("SyncSocialGraphSection: why a Sync button is off", () => {
  it("explains a disabled Sync from Bluesky under the buttons", () => {
    stats = { inBoth: dids(3, "b"), onlyCertified: dids(2, "c"), onlyBluesky: [] }
    isLoading = false
    render(<SyncSocialGraphSection did="did:plc:me" ownDid="did:plc:me" />)

    const button = screen.getByRole("button", { name: /Sync from Bluesky/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(
      "Nothing to sync from Bluesky: you already follow here everyone you follow there.",
    )
    // The other direction has something to do: no reason for it.
    expect(screen.getByRole("button", { name: /Sync to Bluesky/ })).toBeEnabled()
    expect(screen.queryByText(/Nothing to sync to Bluesky/)).toBeNull()
  })

  it("says nothing extra while the lists load", () => {
    stats = { inBoth: [], onlyCertified: [], onlyBluesky: [] }
    isLoading = true
    render(<SyncSocialGraphSection did="did:plc:me" ownDid="did:plc:me" />)

    expect(screen.queryByText(/Nothing to sync/)).toBeNull()
  })

  it("lets 'already in sync' speak for both buttons", () => {
    stats = { inBoth: dids(2, "b"), onlyCertified: [], onlyBluesky: [] }
    isLoading = false
    render(<SyncSocialGraphSection did="did:plc:me" ownDid="did:plc:me" />)

    expect(screen.getByText(/already in sync/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing to sync/)).toBeNull()
  })
})
