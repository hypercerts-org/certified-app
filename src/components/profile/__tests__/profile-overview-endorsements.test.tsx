import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"

// The Overview's data hooks all fetch; stub them with fixed lists.
const received = vi.fn(() => ({
  endorsements: [] as ReceivedEndorsement[],
  isLoading: false,
}))
vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: () => received(),
}))
vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => ({ endorsements: [], isLoading: false, error: null }),
}))
vi.mock("@/hooks/use-user-indexer-activities", () => ({
  useUserIndexerActivities: () => ({
    created: [],
    contributed: [],
    dids: new Map(),
    isLoading: false,
    hasMore: false,
  }),
}))
vi.mock("@/hooks/use-user-activity-count", () => ({
  useUserActivityCount: () => 0,
}))
vi.mock("@/hooks/use-user-projects", () => ({
  useUserProjects: () => ({ projects: [], isLoading: false }),
}))
// The endorser's name and avatar come from the indexer block below; the
// fallback lookup is never needed.
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null }),
}))
vi.mock("@/components/map/map-dynamic", () => ({ default: () => null }))

import ProfileOverview from "../profile-overview"

function endorsement(n: number, note?: string): ReceivedEndorsement {
  return {
    uri: `at://did:plc:issuer${n}/app.certified.badge.award/${n}`,
    cid: `cid${n}`,
    issuerDid: `did:plc:issuer${n}`,
    createdAt: `2026-05-1${n}T00:00:00.000Z`,
    note,
    issuer: {
      did: `did:plc:issuer${n}`,
      handle: `issuer${n}.certified.app`,
      displayName: `Issuer ${n}`,
      description: null,
      avatarCid: null,
      pds: null,
    },
  }
}

afterEach(() => {
  cleanup()
  received.mockReset()
  received.mockImplementation(() => ({ endorsements: [], isLoading: false }))
})

describe("ProfileOverview: Endorsements received", () => {
  it("uses the shared endorsement row, its looks.css hooks included", () => {
    received.mockImplementation(() => ({
      endorsements: [endorsement(1, "Great work on the estuary."), endorsement(2)],
      isLoading: false,
    }))
    const { container } = render(<ProfileOverview did="did:plc:me" basePath="/me.certified.app" />)

    const rows = container.querySelectorAll('li[data-centerpiece="endorsement"]')
    expect(rows).toHaveLength(2)
    // Newest first: Issuer 2, then Issuer 1 with the note.
    const first = rows[1] as HTMLElement
    expect(first.className).toContain("profile-overview__endorse-item")
    const link = within(first).getByRole("link")
    expect(link.getAttribute("href")).toBe("/issuer1.certified.app")
    expect(first.querySelector('[data-part="who"]')!.textContent).toBe("Issuer 1")
    // The name over the date (one text column, like the "Latest" records).
    const when = first.querySelector('[data-part="when"]')!
    expect(when.tagName).toBe("TIME")
    expect(when.parentElement).toBe(first.querySelector('[data-part="who"]')!.parentElement)
    expect(first.querySelector('[data-part="note"]')!.textContent).toBe(
      "Great work on the estuary.",
    )
    // No statement wording ("… endorsed …") any more.
    expect(first.textContent).not.toContain("endorsed")
  })

  it('links "All endorsements" to the endorsements tab even with three or fewer', () => {
    received.mockImplementation(() => ({
      endorsements: [endorsement(1), endorsement(2), endorsement(3)],
      isLoading: false,
    }))
    render(<ProfileOverview did="did:plc:me" basePath="/me.certified.app" />)
    const all = screen.getByRole("link", { name: /All endorsements/ })
    expect(all.getAttribute("href")).toBe("/me.certified.app?tab=endorsements")
  })

  it('has no "All endorsements" link while there are none', () => {
    render(<ProfileOverview did="did:plc:me" basePath="/me.certified.app" />)
    expect(screen.queryByRole("link", { name: /All endorsements/ })).toBeNull()
    expect(screen.getByText(/No endorsements yet/)).toBeTruthy()
  })
})
