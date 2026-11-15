import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"

/**
 * The profile page tells "this account doesn't exist" apart from "the
 * lookup failed": the resolver's 400 means no account goes by the name;
 * a 5xx, a 429 or a network error is a failed load that a retry may fix.
 */
const mockAuthFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (url: string, init: RequestInit) => mockAuthFetch(url, init),
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null }),
}))

import { useUserProfile } from "../use-user-profile"

beforeEach(() => {
  mockAuthFetch.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("useUserProfile: error kinds", () => {
  it('a 400 from the resolver is "not-found"', async () => {
    mockAuthFetch.mockResolvedValue(Response.json({ error: "Invalid DID" }, { status: 400 }))
    const { result } = renderHook(() => useUserProfile("nobody.example.com"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.errorKind).toBe("not-found")
  })

  it('a server error is "failed", and retry asks again', async () => {
    mockAuthFetch.mockResolvedValueOnce(new Response("{}", { status: 503 }))
    const { result } = renderHook(() => useUserProfile("alice.example.com"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.errorKind).toBe("failed")

    mockAuthFetch.mockResolvedValueOnce(
      Response.json({ did: "did:plc:alice", handle: "alice.example.com", displayName: "Alice" }),
    )
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.did).toBe("did:plc:alice"))
    expect(result.current.errorKind).toBeNull()
    expect(result.current.error).toBeNull()
    // The retry skips the HTTP cache.
    expect(mockAuthFetch.mock.calls[1][1]).toMatchObject({ cache: "reload" })
  })

  it('a network error is "failed"', async () => {
    mockAuthFetch.mockRejectedValue(new TypeError("Failed to fetch"))
    const { result } = renderHook(() => useUserProfile("did:plc:alice"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.errorKind).toBe("failed")
  })
})
