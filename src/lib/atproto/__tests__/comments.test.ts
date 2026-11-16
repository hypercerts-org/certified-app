import { describe, it, expect, vi, beforeEach } from "vitest"

const postIndexer = vi.fn()
vi.mock("@/lib/atproto/indexer-client", () => ({
  postIndexer: (...args: unknown[]) => postIndexer(...args),
}))

import {
  MAX_COMMENT_LENGTH,
  buildCommentRecord,
  commentDraftProblem,
  commentText,
  commentTitle,
  fetchCommentsForSubject,
  fetchCommentsForSubjects,
} from "../comments"

const P1 = "at://did:plc:org/org.hypercerts.collection/p1"
const A1 = "at://did:plc:org/org.hypercerts.claim.activity/a1"

function node(rkey: string, subject: string, createdAt: string, text: string) {
  return {
    cursor: rkey,
    node: {
      uri: `at://did:plc:ana/org.hypercerts.context.attachment/${rkey}`,
      cid: `cid-${rkey}`,
      did: "did:plc:ana",
      createdAt,
      title: text,
      shortDescription: null,
      subjects: [{ __typename: "ComAtprotoRepoStrongRef", uri: subject }],
      description: null,
    },
  }
}

beforeEach(() => postIndexer.mockReset())

describe("commentText", () => {
  it("reads the Leaflet body, paragraphs apart", () => {
    expect(
      commentText({
        title: "cut",
        description: {
          $type: "pub.leaflet.pages.linearDocument",
          blocks: [
            { block: { $type: "pub.leaflet.blocks.text", plaintext: "One" } },
            { block: { $type: "pub.leaflet.blocks.text", plaintext: "Two" } },
          ],
        },
      }),
    ).toBe("One\n\nTwo")
  })

  it("falls back to a description string, the short description, then the title", () => {
    expect(commentText({ description: { $type: "org.hypercerts.defs#descriptionString", value: "Plain" } })).toBe("Plain")
    expect(commentText({ shortDescription: " Short ", title: "T" })).toBe("Short")
    expect(commentText({ title: " Only a title " })).toBe("Only a title")
    expect(commentText({})).toBe("")
  })
})

describe("commentTitle", () => {
  it("puts the text on one line", () => {
    expect(commentTitle("Great work\n\non the  nursery")).toBe("Great work on the nursery")
  })

  it("cuts long text to the lexicon's 256 bytes without splitting a character", () => {
    const title = commentTitle("é".repeat(300))
    expect(new TextEncoder().encode(title).length).toBeLessThanOrEqual(256)
    expect(title.endsWith("…")).toBe(true)
    expect(title).not.toContain("�")
    expect(title.slice(0, -1)).toMatch(/^é+$/)
  })
})

describe("commentDraftProblem", () => {
  it("needs some text, within the limit", () => {
    expect(commentDraftProblem("   ")).toBe("empty")
    expect(commentDraftProblem("Hi")).toBeNull()
    expect(commentDraftProblem("x".repeat(MAX_COMMENT_LENGTH))).toBeNull()
    expect(commentDraftProblem("x".repeat(MAX_COMMENT_LENGTH + 1))).toBe("too-long")
  })
})

describe("buildCommentRecord", () => {
  it("writes a comment attachment on the subject, its text as a Leaflet body", () => {
    const record = buildCommentRecord("  First line\nsame paragraph\n\nSecond  ", { uri: P1, cid: "pc" }, "2026-11-16T10:00:00.000Z")
    expect(record).toEqual({
      contentType: "comment",
      title: "First line same paragraph Second",
      description: {
        $type: "pub.leaflet.pages.linearDocument",
        blocks: [
          { block: { $type: "pub.leaflet.blocks.text", plaintext: "First line\nsame paragraph" } },
          { block: { $type: "pub.leaflet.blocks.text", plaintext: "Second" } },
        ],
      },
      subjects: [{ uri: P1, cid: "pc" }],
      createdAt: "2026-11-16T10:00:00.000Z",
    })
  })
})

describe("buildCommentRecord links", () => {
  it("marks web addresses as Leaflet link facets", () => {
    const record = buildCommentRecord("Photos: https://x.org/p", { uri: P1, cid: "pc" })
    const block = (record.description as { blocks: { block: Record<string, unknown> }[] }).blocks[0].block
    expect(block.facets).toEqual([
      {
        index: { byteStart: 8, byteEnd: 23 },
        features: [{ $type: "pub.leaflet.richtext.facet#link", uri: "https://x.org/p" }],
      },
    ])
  })
})

describe("fetchCommentsForSubjects", () => {
  it("sorts each subject's comments newest first and gives every subject an entry", async () => {
    postIndexer.mockResolvedValue({
      ok: true,
      status: 200,
      errors: [],
      data: {
        orgHypercertsContextAttachment: {
          totalCount: 3,
          edges: [
            node("c1", P1, "2026-11-01T00:00:00Z", "older"),
            node("c2", P1, "2026-11-03T00:00:00Z", "newer"),
            node("c3", A1, "2026-11-02T00:00:00Z", "on the activity"),
          ],
        },
      },
    })
    const other = "at://did:plc:org/org.hypercerts.collection/none"
    const batch = await fetchCommentsForSubjects([P1, A1, other])
    expect(postIndexer).toHaveBeenCalledWith(
      "CommentsForSubjects",
      { subjectUris: [P1, A1, other], first: 100 },
      { signal: undefined },
    )
    expect(batch.complete).toBe(true)
    expect(batch.bySubject.get(P1)!.map((c) => c.text)).toEqual(["newer", "older"])
    expect(batch.bySubject.get(A1)!.map((c) => c.text)).toEqual(["on the activity"])
    expect(batch.bySubject.get(other)).toEqual([])
  })

  it("says when the batch was cut short", async () => {
    postIndexer.mockResolvedValue({
      ok: true,
      status: 200,
      errors: [],
      data: { orgHypercertsContextAttachment: { totalCount: 250, edges: [node("c1", P1, "2026-11-01T00:00:00Z", "x")] } },
    })
    expect((await fetchCommentsForSubjects([P1])).complete).toBe(false)
  })

  it("throws when the indexer fails", async () => {
    postIndexer.mockResolvedValue({ ok: false, status: 502, errors: [], data: null })
    await expect(fetchCommentsForSubjects([P1])).rejects.toThrow()
  })
})

describe("fetchCommentsForSubject", () => {
  it("returns the next cursor while there are older comments", async () => {
    postIndexer.mockResolvedValue({
      ok: true,
      status: 200,
      errors: [],
      data: {
        orgHypercertsContextAttachment: {
          totalCount: 60,
          edges: [node("c1", P1, "2026-11-01T00:00:00Z", "x")],
          pageInfo: { hasNextPage: true, endCursor: "cur" },
        },
      },
    })
    const page = await fetchCommentsForSubject(P1, { first: 50 })
    expect(page).toMatchObject({ totalCount: 60, next: "cur" })
    expect(postIndexer).toHaveBeenCalledWith("CommentsForSubject", { subjectUri: P1, first: 50, after: null }, { signal: undefined })
  })
})
