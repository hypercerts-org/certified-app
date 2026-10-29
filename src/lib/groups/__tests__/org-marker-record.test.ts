import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The org marker is read with listRecords, so a personal account (no marker)
 * gets an empty 200 instead of a RecordNotFound failure on every profile view.
 */

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }))
vi.mock("@/lib/auth/fetch", () => ({ authFetch }))

import { getOrgMarkerRecord } from "../org-marker-record"

beforeEach(() => {
  authFetch.mockReset()
})

describe("getOrgMarkerRecord", () => {
  it("asks listRecords, uncached, for the marker collection", async () => {
    authFetch.mockResolvedValue(Response.json({ records: [] }))
    await getOrgMarkerRecord("did:plc:alice")

    const [url, init] = authFetch.mock.calls[0]
    const u = new URL(url, "https://app.test")
    expect(u.pathname).toBe("/api/xrpc/com/atproto/repo/listRecords")
    expect(u.searchParams.get("repo")).toBe("did:plc:alice")
    expect(u.searchParams.get("collection")).toBe("app.certified.actor.organization")
    expect(init).toMatchObject({ cache: "no-store" })
  })

  it("returns null when the account has no marker", async () => {
    authFetch.mockResolvedValue(Response.json({ records: [] }))
    expect(await getOrgMarkerRecord("did:plc:alice")).toBeNull()
  })

  it("returns the self record's value", async () => {
    authFetch.mockResolvedValue(
      Response.json({
        records: [
          { uri: "at://did:plc:alice/app.certified.actor.organization/other", value: { name: "nope" } },
          { uri: "at://did:plc:alice/app.certified.actor.organization/self", value: { name: "Org" } },
        ],
      }),
    )
    expect(await getOrgMarkerRecord("did:plc:alice")).toEqual({ name: "Org" })
  })

  it("returns undefined (unknown) when the lookup fails", async () => {
    authFetch.mockResolvedValue(new Response("", { status: 502 }))
    expect(await getOrgMarkerRecord("did:plc:alice")).toBeUndefined()
  })
})
