import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup, act } from "@testing-library/react"

/**
 * The record pages tell "not found" from "couldn't load": a PDS answers a
 * read of a missing record with 400 (RecordNotFound, passed through by the
 * proxy), a DID with no PDS is 404; a 5xx is a failure to load, which the
 * page offers to retry.
 */

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...a: unknown[]) => authFetch(...a),
}))

vi.mock("@/lib/atproto/indexer", () => ({
  fetchIndexerActivitiesByUris: async () => ({ records: [], dids: new Map() }),
}))

import { PROJECT_NOT_FOUND, useProject } from "../use-project"
import { useActivity } from "../use-activity"

function status(code: number): Response {
  return new Response(JSON.stringify({ error: `Upstream PDS returned ${code}` }), {
    status: code,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  cleanup()
  authFetch.mockReset()
})

describe("useProject", () => {
  it("reads a 400 from the PDS as not found", async () => {
    authFetch.mockResolvedValue(status(400))
    const { result } = renderHook(() => useProject("did:plc:p1", "missing"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(PROJECT_NOT_FOUND)
  })

  it("reads a 502 as a failure to load, and tries again on refetch", async () => {
    authFetch.mockResolvedValue(status(502))
    const { result } = renderHook(() => useProject("did:plc:p2", "rk"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).not.toBe(PROJECT_NOT_FOUND)
    expect(result.current.error).toBeTruthy()

    authFetch.mockResolvedValue(
      new Response(JSON.stringify({ uri: "at://p", cid: "c", value: { title: "Back" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.project?.value.title).toBe("Back"))
    expect(result.current.error).toBeNull()
  })
})

describe("useActivity", () => {
  it("reads a 400 from the PDS as not found", async () => {
    authFetch.mockResolvedValue(status(400))
    const { result } = renderHook(() => useActivity("did:plc:a1", "missing"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe("Activity not found")
  })

  it("reads a 502 as a failure to load", async () => {
    authFetch.mockResolvedValue(status(502))
    const { result } = renderHook(() => useActivity("did:plc:a2", "rk"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe("Couldn't load this activity. Try again.")
  })
})
