import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `listAwards` / `listDefinitions` must page through the WHOLE
 * collection, not just the first 100-record page. A single page
 * silently truncated the profile "Given" count — a repo with 187
 * endorsement awards showed only the 97 that landed in the first page
 * (the rest were affiliation awards). These tests pin that the cursor
 * loop follows every page and forwards `reverse`/`cursor` correctly.
 *
 * The `ensureGroupEndorsementDefinition` block at the bottom shares this
 * file's `authFetch` mock: it pins the `noCache` re-read that stops a
 * bulk group endorse minting one definition per person.
 */

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({ authFetch }))

function page(records: { uri: string }[], cursor?: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      records: records.map((r) => ({ uri: r.uri, cid: `cid-${r.uri}`, value: { x: 1 } })),
      cursor,
    }),
  }
}

beforeEach(() => {
  authFetch.mockReset()
})

describe("listAwards pagination", () => {
  it("follows the cursor across pages and returns every record", async () => {
    const { listAwards } = await import("../badges")
    // Two full pages then a final short page with no cursor.
    const p1 = Array.from({ length: 100 }, (_, i) => ({ uri: `a${i}` }))
    const p2 = Array.from({ length: 100 }, (_, i) => ({ uri: `b${i}` }))
    const p3 = Array.from({ length: 30 }, (_, i) => ({ uri: `c${i}` }))
    authFetch
      .mockResolvedValueOnce(page(p1, "CUR1"))
      .mockResolvedValueOnce(page(p2, "CUR2"))
      .mockResolvedValueOnce(page(p3, undefined))

    const out = await listAwards("did:plc:abc")

    expect(out).toHaveLength(230)
    expect(authFetch).toHaveBeenCalledTimes(3)
    // First call: no cursor, reverse forwarded.
    const url0 = String(authFetch.mock.calls[0][0])
    expect(url0).toContain("collection=app.certified.badge.award")
    expect(url0).toContain("reverse=true")
    expect(url0).not.toContain("cursor=")
    // Later calls thread the previous page's cursor.
    expect(String(authFetch.mock.calls[1][0])).toContain("cursor=CUR1")
    expect(String(authFetch.mock.calls[2][0])).toContain("cursor=CUR2")
  })

  it("stops after a single page when the PDS returns no cursor", async () => {
    const { listAwards } = await import("../badges")
    authFetch.mockResolvedValueOnce(page([{ uri: "only" }], undefined))

    const out = await listAwards("did:plc:abc")

    expect(out).toHaveLength(1)
    expect(authFetch).toHaveBeenCalledTimes(1)
  })

  it("returns an empty list when the first page 404s (absent collection)", async () => {
    const { listAwards } = await import("../badges")
    authFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })

    const out = await listAwards("did:plc:abc")

    expect(out).toEqual([])
  })

  it("keeps records already gathered if a later page fails mid-pagination", async () => {
    const { listAwards } = await import("../badges")
    authFetch
      .mockResolvedValueOnce(page([{ uri: "a" }], "CUR1"))
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })

    const out = await listAwards("did:plc:abc")

    // First page survives; the 404 second page just ends the loop.
    expect(out).toHaveLength(1)
  })
})

describe("ensureGroupEndorsementDefinition", () => {
  const GROUP_DID = "did:plc:group"

  function defPage(uris: string[]) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        records: uris.map((uri) => ({
          uri,
          cid: `cid-${uri}`,
          value: {
            badgeType: "endorsement",
            title: "Endorsement",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        })),
      }),
    }
  }

  it("busts the foreign-repo cache on the re-read before minting", async () => {
    const { ensureGroupEndorsementDefinition } = await import("../badges")
    authFetch
      .mockResolvedValueOnce(defPage([]))
      .mockResolvedValueOnce(defPage([]))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ uri: "at://group/def/new", cid: "cid-new" }),
      })

    const ref = await ensureGroupEndorsementDefinition(GROUP_DID)

    expect(ref).toEqual({ uri: "at://group/def/new", cid: "cid-new" })
    expect(authFetch).toHaveBeenCalledTimes(3)
    // A group's definitions are a FOREIGN repo read, served by the proxy
    // with `Cache-Control: private, max-age=30`. The first read may be
    // served from that cache; the re-read inside the critical section
    // must NOT be, or the second endorsement of a bulk pass reads a
    // pre-create snapshot and mints a second definition.
    expect(authFetch.mock.calls[0][1]?.cache).toBeUndefined()
    expect(authFetch.mock.calls[1][1]?.cache).toBe("no-store")
    expect(String(authFetch.mock.calls[2][0])).toContain(
      "/endorsement-definition",
    )
  })

  it("returns the def the re-read finds instead of minting a second", async () => {
    const { ensureGroupEndorsementDefinition } = await import("../badges")
    authFetch
      .mockResolvedValueOnce(defPage([]))
      .mockResolvedValueOnce(defPage(["at://group/def/existing"]))

    const ref = await ensureGroupEndorsementDefinition(GROUP_DID)

    expect(ref.uri).toBe("at://group/def/existing")
    // No POST: the cache-busting re-read is the whole guard.
    expect(authFetch).toHaveBeenCalledTimes(2)
  })
})
