import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

// Like on a card's bar and in a record page's header: the count from the
// indexer, your own like from your repository, liking and taking it back
// at once, who it's liked as, and signing in first.

const GROUP: Group = { groupDid: "did:plc:grp", handle: "grp.test", displayName: "Coastal Group", role: "admin", accepted: true }

let did: string | null = "did:plc:me"
let activeOrg: Group | null = null
const openSignInModal = vi.fn()

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did, isAuthenticated: !!did, openSignInModal }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg, groups: activeOrg ? [activeOrg] : [], selfGroup: null }),
}))

const fetchCounts = vi.fn()
const fetchOwn = vi.fn()
const like = vi.fn()
const unlike = vi.fn()
vi.mock("@/lib/atproto/likes", async () => {
  const real = await vi.importActual<typeof import("@/lib/atproto/likes")>("@/lib/atproto/likes")
  return {
    likeErrorMessage: real.likeErrorMessage,
    fetchLikesForSubjects: (...a: unknown[]) => fetchCounts(...a),
    fetchOwnLikes: (...a: unknown[]) => fetchOwn(...a),
    likeRecord: (...a: unknown[]) => like(...a),
    unlikeRecord: (...a: unknown[]) => unlike(...a),
  }
})

import LikeButton from "../like-button"
import { ToastProvider } from "@/components/ui/toast"
import { __resetLikesStore } from "@/hooks/use-likes"
import { likeErrorMessage } from "@/lib/atproto/likes"

const SUBJECT = { uri: "at://did:plc:org/org.hypercerts.collection/p1", cid: "pc" }

function counts(likers: string[] | null, available = true) {
  fetchCounts.mockResolvedValue({
    available,
    bySubject: likers ? new Map([[SUBJECT.uri, { count: likers.length, likers }]]) : new Map(),
  })
}

beforeEach(() => {
  __resetLikesStore()
  did = "did:plc:me"
  activeOrg = null
  openSignInModal.mockReset()
  fetchCounts.mockReset()
  fetchOwn.mockReset()
  like.mockReset()
  unlike.mockReset()
  fetchOwn.mockResolvedValue(new Map())
})

afterEach(() => cleanup())

describe("LikeButton", () => {
  it("in a header shows the count, and liking adds you to it at once", async () => {
    counts(["did:plc:ana", "did:plc:bo"])
    like.mockResolvedValue({ uri: "at://did:plc:me/app.certified.feed.like/l1", cid: "lc" })
    render(<LikeButton variant="header" subject={SUBJECT} subjectKind="project" />)
    const button = await screen.findByRole("button", { name: "Like this project, 2 likes" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(await screen.findByRole("button", { name: "Like this project, 3 likes" })).toBeTruthy()
    expect(like).toHaveBeenCalledWith("did:plc:me", "did:plc:me", SUBJECT)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Like this project/ }).getAttribute("aria-pressed")).toBe("true"),
    )
  })

  it("knows your own like from your repository and takes it back", async () => {
    counts(["did:plc:me"])
    fetchOwn.mockResolvedValue(new Map([[SUBJECT.uri, "at://did:plc:me/app.certified.feed.like/l1"]]))
    unlike.mockResolvedValue(undefined)
    render(<LikeButton subject={SUBJECT} subjectKind="project" />)
    const button = await screen.findByRole("button", { name: "Like" })
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"))
    expect(button.textContent).toContain("Liked")
    fireEvent.click(button)
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("false"))
    expect(unlike).toHaveBeenCalledWith("did:plc:me", "did:plc:me", "at://did:plc:me/app.certified.feed.like/l1")
  })

  it("puts a failed like back and says so", async () => {
    counts([])
    like.mockRejectedValue(new Error("PDS unreachable"))
    render(<LikeButton subject={SUBJECT} subjectKind="activity" />)
    const button = await screen.findByRole("button", { name: "Like" })
    fireEvent.click(button)
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(button.getAttribute("aria-pressed")).toBe("false")
  })

  it("in the app, says a failed like in an error toast and keeps the row as it was", async () => {
    counts([])
    // A group route or the PDS can answer with a bare code.
    like.mockRejectedValue(new Error("NotFound"))
    const { container } = render(
      <ToastProvider>
        <LikeButton subject={SUBJECT} subjectKind="activity" />
      </ToastProvider>,
    )
    const button = await screen.findByRole("button", { name: "Like" })
    fireEvent.click(button)
    const toast = await screen.findByRole("alert")
    expect(toast.textContent).toContain("Couldn't like it")
    expect(toast.textContent).not.toContain("NotFound")
    // Rolled back, and nothing new in the action row.
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.textContent).toContain("Like")
    expect(container.querySelector(".like-button__error")).toBeNull()
  })

  it("says a failed unlike as a failed unlike, and puts the like back", async () => {
    counts(["did:plc:me"])
    fetchOwn.mockResolvedValue(new Map([[SUBJECT.uri, "at://did:plc:me/app.certified.feed.like/l1"]]))
    unlike.mockRejectedValue(new Error("Forbidden"))
    render(
      <ToastProvider>
        <LikeButton subject={SUBJECT} subjectKind="activity" />
      </ToastProvider>,
    )
    const button = await screen.findByRole("button", { name: "Like" })
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"))
    fireEvent.click(button)
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't remove the like")
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"))
  })

  it("without counts from the indexer still likes, with no number", async () => {
    counts(null, false)
    render(<LikeButton variant="header" subject={SUBJECT} subjectKind="project" />)
    await waitFor(() => expect(fetchCounts).toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "Like this project" }).textContent).toBe("Like")
  })

  it("likes as the account you act as", async () => {
    activeOrg = GROUP
    counts([])
    like.mockResolvedValue({ uri: "at://did:plc:grp/app.certified.feed.like/l1", cid: "lc" })
    render(<LikeButton subject={SUBJECT} subjectKind="update" />)
    fireEvent.click(await screen.findByRole("button", { name: "Like" }))
    await waitFor(() => expect(like).toHaveBeenCalledWith("did:plc:me", "did:plc:grp", SUBJECT))
    expect(fetchOwn).toHaveBeenCalledWith("did:plc:grp")
  })

  it("signed out, opens sign-in", async () => {
    did = null
    counts([])
    render(<LikeButton subject={SUBJECT} subjectKind="project" />)
    fireEvent.click(screen.getByRole("button", { name: "Like" }))
    expect(openSignInModal).toHaveBeenCalled()
    expect(like).not.toHaveBeenCalled()
  })
})

describe("likeErrorMessage", () => {
  const FALLBACK = "Couldn't like it"
  it("never shows a bare error code or HTTP reason", () => {
    expect(likeErrorMessage(new Error("NotFound"), FALLBACK)).toBe(FALLBACK)
    expect(likeErrorMessage(new Error("InvalidRequest"), FALLBACK)).toBe(FALLBACK)
    expect(likeErrorMessage(new Error("Not found"), FALLBACK)).toBe(FALLBACK)
    expect(likeErrorMessage(new Error(""), FALLBACK)).toBe(FALLBACK)
    expect(likeErrorMessage("oops", FALLBACK)).toBe(FALLBACK)
  })

  it("keeps a sentence written for people, but not protocol words", () => {
    expect(
      likeErrorMessage(new Error("Your session has expired. Sign in again to continue."), FALLBACK),
    ).toBe("Your session has expired. Sign in again to continue.")
    expect(likeErrorMessage(new Error("PDS unreachable"), FALLBACK)).toBe(FALLBACK)
  })
})
