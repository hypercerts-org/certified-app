import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

/**
 * Follow and Endorse on someone else's profile: signed out, both open
 * sign-in; a failed Follow, Unfollow or revoke keeps (or restores) the
 * button's state and says so in an error toast, as Like does (beside the
 * button only where there is no toast region).
 */

const openSignIn = vi.fn()
let auth: { did: string | null; isAuthenticated: boolean; isLoading: boolean }
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ ...auth, openSignIn }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ handle: "me.test" }) }))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ activeOrg: null }) }))

let followingSubjects = new Set<string>()
vi.mock("@/hooks/use-following", () => ({
  useFollowing: () => ({
    subjects: followingSubjects,
    isLoading: false,
    addFollow: vi.fn(),
    removeFollow: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-followers", () => ({
  useFollowers: () => ({ addFollower: vi.fn(), removeFollower: vi.fn() }),
}))

let given: { subjectDid: string; rkey: string; uri: string }[] = []
const refetchGiven = vi.fn(async () => {})
vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => ({
    endorsements: given,
    isLoading: false,
    error: null,
    refetch: refetchGiven,
  }),
}))
vi.mock("@/hooks/use-endorsement-lists", () => ({
  useEndorsementLists: () => ({ lists: [], refetch: vi.fn() }),
}))
vi.mock("@/hooks/use-received-endorsements", () => ({
  addOptimisticReceivedEndorsement: vi.fn(),
  removeOptimisticReceivedEndorsement: vi.fn(),
}))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null, failed: false, retry: vi.fn() }),
}))

const createFollow = vi.fn()
const deleteFollow = vi.fn()
const listFollowing = vi.fn()
vi.mock("@/lib/atproto/follow", () => ({
  createFollow: (...a: unknown[]) => createFollow(...a),
  deleteFollow: (...a: unknown[]) => deleteFollow(...a),
  listFollowing: (...a: unknown[]) => listFollowing(...a),
}))
const deleteEndorsementAward = vi.fn()
vi.mock("@/lib/atproto/badges", () => ({
  createEndorsementAward: vi.fn(),
  deleteEndorsementAward: (...a: unknown[]) => deleteEndorsementAward(...a),
}))
vi.mock("@/lib/atproto/collection", () => ({ appendItemToList: vi.fn() }))

import { ToastProvider } from "@/components/ui/toast"
import { FollowEndorseActions } from "../profile-follow-endorse"

const SUBJECT = "did:plc:subject"

beforeEach(() => {
  auth = { did: "did:plc:me", isAuthenticated: true, isLoading: false }
  followingSubjects = new Set()
  given = []
  vi.spyOn(console, "error").mockImplementation(() => {})
  openSignIn.mockReset()
  createFollow.mockReset()
  deleteFollow.mockReset()
  listFollowing.mockReset()
  deleteEndorsementAward.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("FollowEndorseActions signed out", () => {
  it("offers Follow and Endorse, both opening sign-in", () => {
    auth = { did: null, isAuthenticated: false, isLoading: false }
    render(<FollowEndorseActions did={SUBJECT} />)
    fireEvent.click(screen.getByRole("button", { name: "Follow" }))
    fireEvent.click(screen.getByRole("button", { name: "Endorse" }))
    expect(openSignIn).toHaveBeenCalledTimes(2)
  })
})

describe("FollowEndorseActions failures", () => {
  it("keeps Follow and says so when following fails", async () => {
    createFollow.mockRejectedValue(new Error("PDS down"))
    render(<FollowEndorseActions did={SUBJECT} />)
    fireEvent.click(screen.getByRole("button", { name: "Follow" }))
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't follow. Try again.",
    )
    const button = screen.getByRole("button", { name: "Follow" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
  })

  it("keeps Following and says so when unfollowing fails", async () => {
    followingSubjects = new Set([SUBJECT])
    listFollowing.mockRejectedValue(new Error("PDS down"))
    render(<FollowEndorseActions did={SUBJECT} />)
    fireEvent.click(screen.getByRole("button", { name: "Following" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't unfollow. Try again.",
    )
    expect(screen.getByRole("button", { name: "Following" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
  })

  it("goes back to Endorsed and says so when revoking fails", async () => {
    given = [{ subjectDid: SUBJECT, rkey: "r1", uri: "at://did:plc:me/x/r1" }]
    deleteEndorsementAward.mockRejectedValue(new Error("PDS down"))
    render(<FollowEndorseActions did={SUBJECT} />)
    fireEvent.click(screen.getByRole("button", { name: "Endorsed" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke endorsement", hidden: true }),
    )
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't revoke the endorsement. Try again.",
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Revoke endorsement", hidden: true }),
      ).toBeNull(),
    )
    expect(screen.getByRole("button", { name: "Endorsed" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
  })
})

describe("FollowEndorseActions failures, in the app (a toast region)", () => {
  it("says a failed Follow in an error toast, not beside the button", async () => {
    createFollow.mockRejectedValue(new Error("PDS down"))
    const { container } = render(
      <ToastProvider>
        <FollowEndorseActions did={SUBJECT} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Follow" }))
    expect(await screen.findByText("Couldn't follow. Try again.")).toBeTruthy()
    expect(container.querySelector(".profile-action-error")).toBeNull()
    expect(screen.getByRole("button", { name: "Follow" }).getAttribute("aria-pressed")).toBe(
      "false",
    )
  })

  it("says a failed revoke in an error toast", async () => {
    given = [{ subjectDid: SUBJECT, rkey: "r1", uri: "at://did:plc:me/x/r1" }]
    deleteEndorsementAward.mockRejectedValue(new Error("PDS down"))
    const { container } = render(
      <ToastProvider>
        <FollowEndorseActions did={SUBJECT} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Endorsed" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke endorsement", hidden: true }),
    )
    expect(await screen.findByText("Couldn't revoke the endorsement. Try again.")).toBeTruthy()
    expect(container.querySelector(".profile-action-error")).toBeNull()
  })
})
