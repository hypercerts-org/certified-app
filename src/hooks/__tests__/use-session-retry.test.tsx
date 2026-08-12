import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"

let sessionCallCount = 0

const authFetchMock = vi.fn(async (..._args: unknown[]): Promise<Response> => {
  sessionCallCount += 1
  if (sessionCallCount === 1) {
    // Transient non-OK status (not a thrown/network error).
    return {
      ok: false,
      status: 503,
      json: async () => ({}),
    } as unknown as Response
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ handle: "alice", email: "alice@example.com" }),
  } as unknown as Response
})

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

import { useSession, clearSessionCache } from "../use-session"

beforeEach(() => {
  cleanup()
  clearSessionCache()
  sessionCallCount = 0
  authFetchMock.mockClear()
})

describe("useSession — retry after a non-OK getSession response", () => {
  it("does not cache the null result on a non-OK status; the next mount refetches", async () => {
    const first = renderHook(() => useSession())

    // The 503 resolves to a blank session without erroring the hook.
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    expect(first.result.current.handle).toBeNull()
    expect(first.result.current.error).toBeNull()
    expect(authFetchMock).toHaveBeenCalledTimes(1)

    first.unmount()

    // A fresh mount must refetch (the null result was NOT pinned) and now
    // succeed, surfacing the recovered session.
    const second = renderHook(() => useSession())
    await waitFor(() => expect(second.result.current.handle).toBe("alice"))
    expect(second.result.current.email).toBe("alice@example.com")
    expect(authFetchMock).toHaveBeenCalledTimes(2)
  })
})
