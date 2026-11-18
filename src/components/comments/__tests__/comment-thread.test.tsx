import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react"
import type { FeedComment } from "@/lib/atproto/comments"
import type { Group } from "@/lib/groups/types"

// The comment thread: on a feed card (count, the latest two, earlier ones
// on request, the field opened and closed by Comment), as a record page's
// section (heading, field always open, sign in for visitors), who a
// comment is posted as, links, and deleting your own.

const GROUP: Group = { groupDid: "did:plc:grp", handle: "grp.test", displayName: "Coastal Group", role: "admin", accepted: true }
const OTHER: Group = { groupDid: "did:plc:grp2", handle: "grp2.test", displayName: "Reef Group", role: "member", accepted: true }

let did: string | null = "did:plc:me"
let activeOrg: Group | null = null
let groups: Group[] = []
const openSignInModal = vi.fn()

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did, isAuthenticated: !!did, openSignInModal }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg, groups, selfGroup: null }),
}))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (d: string | null) => ({
    info: d ? { did: d, handle: `${d.split(":").pop()}.test`, displayName: NAMES[d] ?? null, avatarUrl: null } : null,
    isLoading: false,
  }),
}))

const fetchBatch = vi.fn()
const post = vi.fn()
const del = vi.fn()
vi.mock("@/lib/atproto/comments", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/atproto/comments")>()
  return {
    ...real,
    fetchCommentsForSubjects: (...a: unknown[]) => fetchBatch(...a),
    fetchCommentsForSubject: vi.fn(),
    postComment: (...a: unknown[]) => post(...a),
    deleteComment: (...a: unknown[]) => del(...a),
  }
})

const NAMES: Record<string, string> = { "did:plc:ana": "Ana Lima", "did:plc:me": "Me Myself" }

// Likes have their own tests; here they read as none.
vi.mock("@/lib/atproto/likes", () => ({
  fetchLikesForSubjects: async () => ({ available: false, bySubject: new Map() }),
  fetchOwnLikes: async () => new Map(),
  likeRecord: vi.fn(),
  unlikeRecord: vi.fn(),
  likeErrorMessage: (_err: unknown, fallback: string) => fallback,
}))

import CommentThread from "../comment-thread"
import { __resetCommentsStore } from "@/hooks/use-comments"
import { __resetLikesStore } from "@/hooks/use-likes"

const SUBJECT = { uri: "at://did:plc:org/org.hypercerts.collection/p1", cid: "pc" }

function comment(n: number, author = "did:plc:ana", text = `Comment ${n}`): FeedComment {
  return {
    uri: `at://${author}/org.hypercerts.context.attachment/c${n}`,
    cid: `cid${n}`,
    did: author,
    createdAt: `2026-11-${String(n).padStart(2, "0")}T10:00:00.000Z`,
    text,
  }
}

function serve(list: FeedComment[]) {
  const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  fetchBatch.mockResolvedValue({ bySubject: new Map([[SUBJECT.uri, sorted]]), complete: true })
}

function card() {
  return render(
    <CommentThread subject={SUBJECT} subjectTitle="Mangrove nursery" subjectKind="project" />,
  )
}

beforeEach(() => {
  __resetCommentsStore()
  __resetLikesStore()
  did = "did:plc:me"
  activeOrg = null
  groups = []
  openSignInModal.mockReset()
  fetchBatch.mockReset()
  post.mockReset()
  del.mockReset()
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

describe("CommentThread on a card", () => {
  it("shows the count and the latest two, oldest of them first", async () => {
    serve([comment(1), comment(2), comment(3), comment(4), comment(5)])
    card()
    expect(await screen.findByText("5 comments")).toBeTruthy()
    const list = screen.getByRole("list", { name: "Comments on Mangrove nursery" })
    expect(within(list).getAllByText(/^Comment \d$/).map((n) => n.textContent)).toEqual(["Comment 4", "Comment 5"])
    fireEvent.click(screen.getByRole("button", { name: "View 3 earlier comments" }))
    expect(within(list).getAllByText(/^Comment \d$/)).toHaveLength(5)
  })

  it("asks once for the cards that mount together", async () => {
    serve([])
    render(
      <>
        <CommentThread subject={SUBJECT} subjectTitle="A" subjectKind="project" />
        <CommentThread subject={{ uri: "at://did:plc:org/org.hypercerts.claim.activity/a1", cid: "ac" }} subjectTitle="B" subjectKind="activity" />
      </>,
    )
    await waitFor(() => expect(fetchBatch).toHaveBeenCalledTimes(1))
    expect(fetchBatch.mock.calls[0][0]).toEqual([SUBJECT.uri, "at://did:plc:org/org.hypercerts.claim.activity/a1"])
  })

  it("opens and closes the field with Comment, keeping the draft", async () => {
    serve([])
    card()
    const button = screen.getByRole("button", { name: "Comment" })
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Half a thought" } })
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(button)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Half a thought")
  })

  it("writes a comment as you and shows it straight away", async () => {
    serve([])
    post.mockImplementation(async (_own, author, _subject, text: string) => comment(9, author, text.trim()))
    card()
    await waitFor(() => expect(fetchBatch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    const field = screen.getByRole("textbox", { name: "Write a comment on Mangrove nursery" })
    expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field, { target: { value: "  Lovely to see  " } })
    fireEvent.click(screen.getByRole("button", { name: "Post" }))
    await screen.findByText("Lovely to see")
    expect(post).toHaveBeenCalledWith("did:plc:me", "did:plc:me", SUBJECT, "  Lovely to see  ")
    expect(screen.getByText("1 comment")).toBeTruthy()
    expect((field as HTMLTextAreaElement).value).toBe("")
  })

  // One account decides everything: comments come from the account you
  // act as, with no picker of their own (switch in the account control).
  it("posts as the account you act as, with no picker of its own", async () => {
    groups = [GROUP, OTHER]
    activeOrg = GROUP
    serve([])
    post.mockResolvedValue(comment(9, "did:plc:grp"))
    card()
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    expect(screen.queryByRole("combobox", { name: "Comment as" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Comment as/ })).toBeNull()
    expect(screen.getByText("Commenting as Coastal Group")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "From the group" } })
    fireEvent.click(screen.getByRole("button", { name: "Post" }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0].slice(0, 2)).toEqual(["did:plc:me", "did:plc:grp"])
  })

  it("posts as you when you act as yourself, even with groups", async () => {
    groups = [GROUP]
    activeOrg = null
    serve([])
    post.mockResolvedValue(comment(9, "did:plc:me"))
    card()
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    expect(screen.queryByText(/Commenting as/)).toBeNull()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "From me" } })
    fireEvent.click(screen.getByRole("button", { name: "Post" }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0].slice(0, 2)).toEqual(["did:plc:me", "did:plc:me"])
  })

  it("makes web addresses in comments links", async () => {
    serve([comment(1, "did:plc:ana", "Photos at https://example.org/gallery/2026, and www.reef.org.")])
    card()
    const link = (await screen.findByRole("link", { name: "example.org/gallery/2026" })) as HTMLAnchorElement
    expect(link.href).toBe("https://example.org/gallery/2026")
    expect(link.target).toBe("_blank")
    expect(link.rel).toContain("ugc")
    expect((screen.getByRole("link", { name: "reef.org" }) as HTMLAnchorElement).href).toBe("https://www.reef.org/")
  })

  it("lets you delete only your own comments", async () => {
    serve([comment(1), comment(2, "did:plc:me")])
    del.mockResolvedValue(undefined)
    card()
    await screen.findByText("Comment 2")
    const deletes = screen.getAllByRole("button", { name: "Delete" })
    expect(deletes).toHaveLength(1)
    fireEvent.click(deletes[0])
    // jsdom keeps <dialog> closed, so its buttons count as hidden.
    const dialog = document.querySelector("dialog") as HTMLElement
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete", hidden: true }))
    await waitFor(() => expect(screen.queryByText("Comment 2")).toBeNull())
    expect(del).toHaveBeenCalledWith("did:plc:me", expect.objectContaining({ uri: comment(2, "did:plc:me").uri }))
    expect(screen.getByText("1 comment")).toBeTruthy()
  })

  it("says a failed post or delete in a sentence, not the upstream error", async () => {
    serve([comment(2, "did:plc:me")])
    post.mockRejectedValue(new Error("XRPC 502 upstream"))
    del.mockRejectedValue(new Error("InvalidToken"))
    card()
    await screen.findByText("Comment 2")
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hello" } })
    fireEvent.click(screen.getByRole("button", { name: "Post" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't post the comment. Try again in a moment.",
    )
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    const dialog = document.querySelector("dialog") as HTMLElement
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete", hidden: true }))
    await screen.findByText("Couldn't delete the comment. Try again in a moment.")
    expect(screen.queryByText(/InvalidToken|upstream/)).toBeNull()
  })

  it("signed out, Comment opens sign-in", () => {
    did = null
    serve([])
    card()
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    expect(openSignInModal).toHaveBeenCalled()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})

describe("CommentThread as a record page's section", () => {
  function section() {
    return render(
      <CommentThread layout="section" subject={SUBJECT} subjectTitle="Mangrove nursery" subjectKind="project" />,
    )
  }

  it("has a Comments heading with the count and the field open", async () => {
    serve([comment(1), comment(2)])
    section()
    await screen.findByText("Comment 2")
    expect(screen.getByRole("heading", { name: "Comments 2" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Write a comment on Mangrove nursery" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Comment" })).toBeNull()
  })

  it("asks a visitor to sign in to comment", async () => {
    did = null
    serve([comment(1)])
    section()
    await screen.findByText("Comment 1")
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Sign in to comment" }))
    expect(openSignInModal).toHaveBeenCalled()
  })
})
