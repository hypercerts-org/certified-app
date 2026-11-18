import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

/**
 * The Endorsements and Followers tabs as a visitor sees them: a list known
 * to be empty loses its segment, and the one list left says what it is in
 * a visible heading; a list that failed to load is not known to be empty
 * (its segment stays, saying it couldn't load, with Try again). Received
 * shows each account once, however many awards it gave.
 */

let viewerDid: string | null = null
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: viewerDid, isAuthenticated: !!viewerDid, isLoading: false }),
}))
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
const deleteFollow = vi.fn()
const listFollowing = vi.fn()
vi.mock("@/lib/atproto/follow", () => ({
  deleteFollow: (...a: unknown[]) => deleteFollow(...a),
  listFollowing: (...a: unknown[]) => listFollowing(...a),
  createFollow: vi.fn(),
}))

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
interface FollowRow {
  uri: string
  cid: string
  rkey: string
  value: { subject: string; createdAt: string }
}
let following: {
  records: FollowRow[]
  subjects: Set<string>
  count: number
  isLoading: boolean
  error: string | null
  refetch: () => void
  addFollow: (subject: string, uri: string, cid: string) => void
  removeFollow: (subject: string) => void
}
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
  viewerDid = null
  deleteFollow.mockReset()
  listFollowing.mockReset()
  received = { endorsements: [], isLoading: false, error: null, refetch: vi.fn() }
  given = { endorsements: [], isLoading: false, error: null, refetch: vi.fn() }
  followers = { entries: [], count: 0, isLoading: false, error: null, refetch: vi.fn() }
  following = {
    records: [],
    subjects: new Set(),
    count: 0,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    addFollow: vi.fn(),
    removeFollow: vi.fn(),
  }
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

describe("ProfileFollowers on your own profile", () => {
  it("unfollows with one tap, no confirm, and keeps the row so Follow undoes it", async () => {
    viewerDid = DID
    const row: FollowRow = {
      uri: "at://did:plc:ada/follow/f1",
      cid: "f1",
      rkey: "f1",
      value: { subject: "did:plc:bo", createdAt: "2026-05-01T00:00:00.000Z" },
    }
    following = {
      ...following,
      count: 1,
      records: [row],
      subjects: new Set(["did:plc:bo"]),
      removeFollow: vi.fn(() => {
        following = { ...following, records: [], subjects: new Set(), count: 0 }
      }),
    }
    listFollowing.mockResolvedValue({ records: [row] })
    deleteFollow.mockResolvedValue(undefined)
    search = new URLSearchParams("sub=following")
    const { rerender } = render(<ProfileFollowers did={DID} />)
    const toggle = screen.getByRole("button", { name: "Following Name bo" })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(toggle)
    await waitFor(() => expect(following.removeFollow).toHaveBeenCalledWith("did:plc:bo"))
    expect(deleteFollow).toHaveBeenCalledWith(DID, "f1", { targetDid: undefined })
    // No dialog, red or otherwise.
    expect(document.querySelector("dialog")).toBeNull()
    rerender(<ProfileFollowers did={DID} />)
    expect(screen.getByRole("button", { name: "Follow Name bo" }).getAttribute("aria-pressed")).toBe(
      "false",
    )
  })

  it("has no Following toggles on someone else's list", () => {
    viewerDid = "did:plc:visitor"
    following = {
      ...following,
      count: 1,
      records: [
        { uri: "at://did:plc:ada/follow/f1", cid: "f1", rkey: "f1", value: { subject: "did:plc:bo", createdAt: "2026-05-01T00:00:00.000Z" } },
      ],
      subjects: new Set(["did:plc:bo"]),
    }
    render(<ProfileFollowers did={DID} />)
    expect(screen.queryByRole("button", { name: /Following Name bo|Follow Name bo/ })).toBeNull()
  })
})
