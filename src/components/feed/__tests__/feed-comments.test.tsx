import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react"
import type { FeedComment } from "@/lib/atproto/comments"

// The comment thread under a feed card: count, the latest two, earlier
// ones on request, writing one (as you or the group you act for), and
// deleting your own.

let activeOrg: { groupDid: string; handle: string; displayName?: string } | null = null
let groups: { groupDid: string }[] = []

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg, groups }),
}))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    info: did ? { did, handle: `${did.split(":").pop()}.test`, displayName: NAMES[did] ?? null, avatarUrl: null } : null,
    isLoading: false,
  }),
}))

const fetchBatch = vi.fn()
const fetchOne = vi.fn()
const post = vi.fn()
const del = vi.fn()
vi.mock("@/lib/atproto/comments", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/atproto/comments")>()
  return {
    ...real,
    fetchCommentsForSubjects: (...a: unknown[]) => fetchBatch(...a),
    fetchCommentsForSubject: (...a: unknown[]) => fetchOne(...a),
    postComment: (...a: unknown[]) => post(...a),
    deleteComment: (...a: unknown[]) => del(...a),
  }
})

const NAMES: Record<string, string> = {
  "did:plc:ana": "Ana Lima",
  "did:plc:me": "Me Myself",
  "did:plc:grp": "Coastal Group",
}

import FeedComments from "../feed-comments"
import { __resetCommentsStore } from "@/hooks/use-comments"

const SUBJECT = { uri: "at://did:plc:org/org.hypercerts.collection/p1", cid: "pc" }

function comment(n: number, did = "did:plc:ana"): FeedComment {
  return {
    uri: `at://${did}/org.hypercerts.context.attachment/c${n}`,
    cid: `cid${n}`,
    did,
    createdAt: `2026-11-${String(n).padStart(2, "0")}T10:00:00.000Z`,
    text: `Comment ${n}`,
  }
}

function serve(list: FeedComment[]) {
  // Newest first, as the library returns them.
  const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  fetchBatch.mockResolvedValue({ bySubject: new Map([[SUBJECT.uri, sorted]]), complete: true })
}

function renderThread() {
  return render(<FeedComments subject={SUBJECT} subjectTitle="Mangrove nursery" subjectKind="project" />)
}

beforeEach(() => {
  __resetCommentsStore()
  activeOrg = null
  groups = []
  fetchBatch.mockReset()
  fetchOne.mockReset()
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

describe("FeedComments", () => {
  it("shows the count and the latest two, oldest of them first", async () => {
    serve([comment(1), comment(2), comment(3), comment(4), comment(5)])
    renderThread()
    expect(await screen.findByText("5 comments")).toBeTruthy()
    const list = screen.getByRole("list", { name: "Comments on Mangrove nursery" })
    expect(within(list).getAllByText(/^Comment \d$/).map((n) => n.textContent)).toEqual(["Comment 4", "Comment 5"])
    fireEvent.click(screen.getByRole("button", { name: "View 3 earlier comments" }))
    expect(within(list).getAllByText(/^Comment \d$/)).toHaveLength(5)
    expect(screen.queryByRole("button", { name: /earlier comment/ })).toBeNull()
  })

  it("asks once for the cards that mount together", async () => {
    serve([])
    render(
      <>
        <FeedComments subject={SUBJECT} subjectTitle="A" subjectKind="project" />
        <FeedComments subject={{ uri: "at://did:plc:org/org.hypercerts.claim.activity/a1", cid: "ac" }} subjectTitle="B" subjectKind="activity" />
      </>,
    )
    await waitFor(() => expect(fetchBatch).toHaveBeenCalledTimes(1))
    expect(fetchBatch.mock.calls[0][0]).toEqual([SUBJECT.uri, "at://did:plc:org/org.hypercerts.claim.activity/a1"])
  })

  it("writes a comment as you and shows it straight away", async () => {
    serve([])
    post.mockImplementation(async (_own, author, _subject, text: string) => ({
      ...comment(9, author),
      text: text.trim(),
    }))
    renderThread()
    await waitFor(() => expect(fetchBatch).toHaveBeenCalled())
    expect(screen.queryByText(/comments?$/)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    const field = screen.getByRole("textbox", { name: "Write a comment on Mangrove nursery" })
    const postButton = screen.getByRole("button", { name: "Post" }) as HTMLButtonElement
    expect(postButton.disabled).toBe(true)
    fireEvent.change(field, { target: { value: "  Lovely to see  " } })
    fireEvent.click(postButton)

    await screen.findByText("Lovely to see")
    expect(post).toHaveBeenCalledWith("did:plc:me", "did:plc:me", SUBJECT, "  Lovely to see  ")
    expect(screen.getByText("1 comment")).toBeTruthy()
    expect((field as HTMLTextAreaElement).value).toBe("")
  })

  it("writes as the group whose workspace is open, and says so", async () => {
    activeOrg = { groupDid: "did:plc:grp", handle: "grp.test", displayName: "Coastal Group" }
    serve([])
    post.mockResolvedValue(comment(9, "did:plc:grp"))
    renderThread()
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    expect(screen.getByText("Commenting as Coastal Group")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "From the group" } })
    fireEvent.click(screen.getByRole("button", { name: "Post" }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0].slice(0, 2)).toEqual(["did:plc:me", "did:plc:grp"])
  })

  it("lets you delete only your own comments", async () => {
    serve([comment(1), comment(2, "did:plc:me")])
    del.mockResolvedValue(undefined)
    renderThread()
    await screen.findByText("Comment 2")
    const deletes = screen.getAllByRole("button", { name: "Delete" })
    expect(deletes).toHaveLength(1)
    fireEvent.click(deletes[0])
    // jsdom keeps <dialog> closed, so its buttons count as hidden.
    const dialog = document.querySelector("dialog") as HTMLElement
    expect(within(dialog).getByText("Delete comment?", { exact: false })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete", hidden: true }))
    await waitFor(() => expect(screen.queryByText("Comment 2")).toBeNull())
    expect(del).toHaveBeenCalledWith("did:plc:me", expect.objectContaining({ uri: comment(2, "did:plc:me").uri }))
    expect(screen.getByText("1 comment")).toBeTruthy()
  })
})
