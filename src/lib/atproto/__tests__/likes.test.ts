import { describe, it, expect, vi, beforeEach } from "vitest"

const postIndexer = vi.fn()
vi.mock("@/lib/atproto/indexer-client", () => ({
  postIndexer: (...args: unknown[]) => postIndexer(...args),
}))
const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}))

import { fetchLikesForSubjects, fetchOwnLikes } from "../likes"

const P1 = "at://did:plc:org/org.hypercerts.collection/p1"
const A1 = "at://did:plc:org/org.hypercerts.claim.activity/a1"

beforeEach(() => {
  postIndexer.mockReset()
  authFetch.mockReset()
})

function like(did: string, subject: string, n: number) {
  return { node: { uri: `at://${did}/app.certified.feed.like/l${n}`, did, subject: { uri: subject } } }
}

describe("fetchLikesForSubjects", () => {
  it("counts each account once per subject", async () => {
    postIndexer.mockResolvedValue({
      ok: true,
      status: 200,
      errors: [],
      data: {
        appCertifiedFeedLike: {
          totalCount: 4,
          edges: [like("did:plc:a", P1, 1), like("did:plc:a", P1, 2), like("did:plc:b", P1, 3), like("did:plc:a", A1, 4)],
        },
      },
    })
    const batch = await fetchLikesForSubjects([P1, A1])
    expect(batch.available).toBe(true)
    expect(batch.bySubject.get(P1)).toEqual({ count: 2, likers: ["did:plc:a", "did:plc:b"] })
    expect(batch.bySubject.get(A1)).toEqual({ count: 1, likers: ["did:plc:a"] })
  })

  it("counts each subject on its own when the batch was cut short", async () => {
    postIndexer
      .mockResolvedValueOnce({ ok: true, status: 200, errors: [], data: { appCertifiedFeedLike: { totalCount: 500, edges: [like("did:plc:a", P1, 1)] } } })
      .mockResolvedValueOnce({ ok: true, status: 200, errors: [], data: { appCertifiedFeedLike: { totalCount: 420, edges: [] } } })
    const batch = await fetchLikesForSubjects([P1])
    expect(batch.bySubject.get(P1)).toEqual({ count: 420, likers: null })
    expect(postIndexer).toHaveBeenLastCalledWith("LikeCount", { subjectUri: P1 }, { signal: undefined })
  })

  it("reports an indexer that can't count likes as unavailable, not an error", async () => {
    postIndexer.mockResolvedValue({
      ok: true,
      status: 200,
      errors: [{ message: 'Cannot query field "appCertifiedFeedLike" on type "Query".' }],
      data: null,
    })
    expect(await fetchLikesForSubjects([P1])).toMatchObject({ available: false })
  })

  it("throws when the indexer is down", async () => {
    postIndexer.mockResolvedValue({ ok: false, status: 502, errors: [], data: null })
    await expect(fetchLikesForSubjects([P1])).rejects.toThrow()
  })
})

describe("fetchOwnLikes", () => {
  it("maps what an account liked to its like records, across pages", async () => {
    authFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            records: [{ uri: "at://did:plc:me/app.certified.feed.like/l1", value: { subject: { uri: P1 } } }],
            cursor: "c1",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ records: [{ uri: "at://did:plc:me/app.certified.feed.like/l2", value: { subject: { uri: A1 } } }] }),
        ),
      )
    const likes = await fetchOwnLikes("did:plc:me")
    expect([...likes]).toEqual([
      [P1, "at://did:plc:me/app.certified.feed.like/l1"],
      [A1, "at://did:plc:me/app.certified.feed.like/l2"],
    ])
    expect(String(authFetch.mock.calls[1][0])).toContain("cursor=c1")
  })

  it("is empty for an account that never liked anything", async () => {
    authFetch.mockResolvedValue(new Response("{}", { status: 400 }))
    expect((await fetchOwnLikes("did:plc:me")).size).toBe(0)
  })
})
