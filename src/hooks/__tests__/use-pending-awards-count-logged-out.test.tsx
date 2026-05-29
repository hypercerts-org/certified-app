import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, cleanup } from "@testing-library/react"

// Logged-out state: the hook short-circuits before touching the
// responses fetch or the scan cache, so those collaborators only
// need inert stubs. useAuth drives the branch under test.
const authState = { did: null as string | null, isAuthenticated: false }

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => authState,
}))

vi.mock("@/hooks/use-profile-responses", () => ({
  useProfileResponses: () => ({ responses: [], isLoading: false }),
}))

vi.mock("@/hooks/use-received-endorsements", () => ({
  peekCachedReceivedEndorsements: () => null,
}))

import { usePendingAwardsCount } from "../use-pending-awards-count"

beforeEach(() => {
  cleanup()
  authState.did = null
  authState.isAuthenticated = false
})

describe("usePendingAwardsCount — logged-out contract", () => {
  it("returns null (not 0) when logged out, matching the JSDoc", () => {
    const { result } = renderHook(() => usePendingAwardsCount())
    expect(result.current).toBeNull()
  })

  it("returns null when authenticated but did is missing", () => {
    authState.isAuthenticated = true
    authState.did = null
    const { result } = renderHook(() => usePendingAwardsCount())
    expect(result.current).toBeNull()
  })
})
