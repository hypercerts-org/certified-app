import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

/**
 * The Endorsements and Followers tabs as a visitor sees them: a list known
 * to be empty loses its segment, and the one list left says what it is in
 * a visible heading; a list that failed to load is not known to be empty
 * (its segment stays, saying it couldn't load, with Try again). Received
 * shows each account once, however many awards it gave.
 */

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ did: null }) }))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ activeOrg: null }) }))
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({
  usePathname: () => "/ada.test",
  useSearchParams: () => search,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    info: did ? { did, handle: `${did.slice(8)}.test`, displayName: `Name ${did.slice(8)}`, avatarUrl: null } : null,
    isLoading: false,
    error: null,
    failed: false,
    retry: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-org-marker", () => ({
  useOrgMarker: (did: string) => ({
    isOrg: false,
    marker: null,
    isLoading: false,
    answeredFor: did,
    failed: false,
    refresh: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-author-names-map", () => ({ useAuthorNamesMap: () => new Map() }))
vi.mock("@/hooks/use-own-response-states", () => ({
  useOwnResponseStates: () => ({
    resolve: () => ({ state: null }),
    responses: [],
    invalidate: vi.fn(),
    refetch: vi.fn(),
  }),
}))
vi.mock("@/lib/atproto/badges", () => ({
  createEndorsementAward: vi.fn(),
  deleteEndorsementAward: vi.fn(),
  createResponse: vi.fn(),
}))
vi.mock("@/lib/atproto/follow", () => ({ deleteFollow: vi.fn() }))

interface Received {
  uri: string
  cid: string
  issuerDid: string
  createdAt: string
  note?: string
}
let received: { endorsements: Received[]; isLoading: boolean; error: string | null; refetch: () => void }
let given: { endorsements: unknown[]; isLoading: boolean; error: string | null; refetch: () => void }
vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: () => received,
}))
vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => given,
}))

let followers: { entries: unknown[]; count: number | null; isLoading: boolean; error: string | null; refetch: () => void }
let following: { records: unknown[]; count: number; isLoading: boolean; error: string | null; refetch: () => void }
vi.mock("@/hooks/use-followers", () => ({ useFollowers: () => followers }))
vi.mock("@/hooks/use-following", () => ({ useFollowing: () => following }))

import ProfileEndorsements from "../profile-endorsements"
import ProfileFollowers from "../profile-followers"

const DID = "did:plc:ada"

function award(issuer: string, day: number, note?: string): Received {
  return {
    uri: `at://${issuer}/app.certified.badge.award/${day}`,
    cid: `c${day}`,
    issuerDid: issuer,
    createdAt: `2026-05-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    note,
  }
}

beforeEach(() => {
  search = new URLSearchParams()
  received = { endorsements: [], isLoading: false, error: null, refetch: vi.fn() }
  given = { endorsements: [], isLoading: false, error: null, refetch: vi.fn() }
  followers = { entries: [], count: 0, isLoading: false, error: null, refetch: vi.fn() }
  following = { records: [], count: 0, isLoading: false, error: null, refetch: vi.fn() }
})

afterEach(() => {
  cleanup()
})

describe("ProfileEndorsements for a visitor", () => {
  it("names the one list left, and shows each endorsing account once", () => {
    received.endorsements = [award("did:plc:rosa", 3, "Again."), award("did:plc:rosa", 1), award("did:plc:bo", 2)]
    const { container } = render(<ProfileEndorsements did={DID} />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByRole("heading", { name: "Received" })).toBeTruthy()
    const rows = container.querySelectorAll(".profile-person")
    expect(rows).toHaveLength(2)
    // Rosa's newest award stands for both.
    expect(rows[0].textContent).toContain("Again.")
  })

  it("names Given when only the endorsements given are left", () => {
    given.endorsements = [
      { uri: "at://did:plc:ada/award/g1", cid: "g1", rkey: "g1", rkeys: ["g1"], subjectDid: "did:plc:bo", createdAt: "2026-05-01T00:00:00.000Z" },
    ]
    render(<ProfileEndorsements did={DID} />)
    expect(screen.getByRole("heading", { name: "Given" })).toBeTruthy()
  })

  it("keeps a list that failed to load, saying so with Try again", () => {
    received.endorsements = [award("did:plc:rosa", 1)]
    given = { ...given, error: "Indexer query failed: 429" }
    // The Given segment, open (the sub-tab lives in the address).
    search = new URLSearchParams("sub=given")
    render(<ProfileEndorsements did={DID} />)
    // Both segments stay: a failed list isn't an empty one.
    expect(screen.getByRole("tab", { name: /Received/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Given/ }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Couldn't load endorsements")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(given.refetch).toHaveBeenCalled()
  })
})

describe("ProfileFollowers for a visitor", () => {
  it("names the follows when they are the one list left", () => {
    following = {
      ...following,
      count: 1,
      records: [
        { uri: "at://did:plc:ada/follow/f1", cid: "f1", rkey: "f1", value: { subject: "did:plc:bo", createdAt: "2026-05-01T00:00:00.000Z" } },
      ],
    }
    render(<ProfileFollowers did={DID} />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByRole("heading", { name: "Following" })).toBeTruthy()
  })

  it("keeps the Followers list when it failed to load, with Try again", () => {
    followers = { ...followers, count: null, error: "Failed to load followers" }
    following = {
      ...following,
      count: 1,
      records: [
        { uri: "at://did:plc:ada/follow/f1", cid: "f1", rkey: "f1", value: { subject: "did:plc:bo", createdAt: "2026-05-01T00:00:00.000Z" } },
      ],
    }
    render(<ProfileFollowers did={DID} />)
    expect(screen.getByRole("tab", { name: /Followers/ })).toBeTruthy()
    expect(screen.getByText("Couldn't load followers")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(followers.refetch).toHaveBeenCalled()
  })
})
