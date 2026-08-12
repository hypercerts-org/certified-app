import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"

/**
 * Tests the coerceClaimActivityValue guard on `useActivity`'s live-PDS
 * path. ATProto is open, so a foreign repo can hold a claim.activity whose
 * string-declared fields are objects; unguarded, those crash React render
 * sites ("Objects are not valid as a React child"). The guard must blank
 * the render fields while preserving everything else — the loadActivity
 * cache seeds the edit route's form.
 *
 * Mirrors the mock setup of use-activity-indexer-fallback.test.tsx; each
 * test uses a unique did/rkey so the module-level cache doesn't bleed.
 */

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...a: unknown[]) => authFetch(...a),
}))

const fetchIndexerActivitiesByUris = vi.fn()
vi.mock("@/lib/atproto/indexer", () => ({
  fetchIndexerActivitiesByUris: (...a: unknown[]) =>
    fetchIndexerActivitiesByUris(...a),
}))

import { useActivity } from "../use-activity"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  cleanup()
  authFetch.mockReset()
  fetchIndexerActivitiesByUris.mockReset()
})

describe("useActivity — malformed PDS value coercion", () => {
  it("blanks non-string render fields and keeps the rest of the record", async () => {
    const did = "did:plc:malformedcase0000000a"
    const rkey = "rkeyMal"
    const uri = `at://${did}/org.hypercerts.claim.activity/${rkey}`

    authFetch.mockResolvedValue(
      jsonResponse({
        uri,
        cid: "cid-mal",
        value: {
          title: { evil: true },
          shortDescription: ["not", "a", "string"],
          createdAt: "2026-01-01T00:00:00.000Z",
          image: { mimeType: "image/png" },
          workScope: "biodiversity",
        },
      }),
    )

    const { result } = renderHook(() => useActivity(did, rkey))

    await waitFor(() => expect(result.current.activity).not.toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.activity?.value.title).toBe("")
    expect(result.current.activity?.value.shortDescription).toBe("")
    expect(result.current.activity?.value.createdAt).toBe(
      "2026-01-01T00:00:00.000Z",
    )
    // Non-render fields survive the coercion untouched.
    expect(result.current.activity?.value.image).toEqual({
      mimeType: "image/png",
    })
    expect(result.current.activity?.value.workScope).toBe("biodiversity")
    expect(fetchIndexerActivitiesByUris).not.toHaveBeenCalled()
  })

  it("leaves a well-formed PDS value intact", async () => {
    const did = "did:plc:wellformedcase000000a"
    const rkey = "rkeyOk"
    const uri = `at://${did}/org.hypercerts.claim.activity/${rkey}`

    authFetch.mockResolvedValue(
      jsonResponse({
        uri,
        cid: "cid-ok",
        value: {
          title: "Live Activity",
          shortDescription: "All strings",
          createdAt: "2026-01-01T00:00:00.000Z",
          startDate: "2025-11-01",
        },
      }),
    )

    const { result } = renderHook(() => useActivity(did, rkey))

    await waitFor(() => expect(result.current.activity).not.toBeNull())
    expect(result.current.activity?.value.title).toBe("Live Activity")
    expect(result.current.activity?.value.shortDescription).toBe("All strings")
    expect(result.current.activity?.value.startDate).toBe("2025-11-01")
  })
})
