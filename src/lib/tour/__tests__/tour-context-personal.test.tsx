import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"

/**
 * A `personalOnly` step (the "Your ID" stop in your own Settings) is
 * skipped while acting as a group: /settings is always the personal
 * account's, so it would show the wrong account.
 */

const org = vi.hoisted(() => ({ activeOrg: null as null | { groupDid: string } }))

vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: true }),
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true, did: "did:plc:tour-personal-test" }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: org.activeOrg }),
}))
vi.mock("../tour-sentinel", () => ({
  isTourCompleted: () => false,
  markTourCompleted: vi.fn(),
  isTourPending: () => false,
  clearTourPending: vi.fn(),
}))
vi.mock("../tour-steps", () => {
  const mk = (id: string, personalOnly?: boolean) => ({
    id,
    navigateTo: null,
    anchor: null,
    title: id,
    body: id,
    ...(personalOnly ? { personalOnly } : {}),
  })
  return { TOUR_STEPS: [mk("welcome"), mk("settings", true), mk("help")] }
})

import { TourProvider, useTour } from "../tour-context"

beforeEach(() => {
  cleanup()
  org.activeOrg = null
})

describe("TourProvider: personal-only steps", () => {
  it("visits your Settings while acting as yourself", () => {
    const { result } = renderHook(() => useTour(), { wrapper: TourProvider })
    act(() => result.current.start())
    act(() => result.current.next())

    expect(result.current.totalSteps).toBe(3)
    expect(result.current.step?.id).toBe("settings")
  })

  it("skips them while acting as a group", () => {
    org.activeOrg = { groupDid: "did:plc:group" }
    const { result } = renderHook(() => useTour(), { wrapper: TourProvider })
    act(() => result.current.start())
    act(() => result.current.next())

    expect(result.current.totalSteps).toBe(2)
    expect(result.current.step?.id).toBe("help")
  })
})
