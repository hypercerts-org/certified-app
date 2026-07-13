import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"

/**
 * Clamping behavior when the platform-filtered steps array SHRINKS
 * mid-tour (crossing the 800px boundary swaps desktop/mobile nav steps,
 * which differ in length). The context must expose a clamped stepIndex
 * (so "Step N of M", the progress dots, and the isLast check all stay
 * in range) and back() must step from the clamped position instead of
 * appearing dead while it walks the overflowed stored index down.
 */

// Layout is controlled per-test through this hoisted latch.
const layout = vi.hoisted(() => ({ isDesktop: true }))

vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: layout.isDesktop }),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true, did: "did:plc:tour-clamp-test" }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null }),
}))

// No pending/completed sentinel state — the tour only runs via start().
vi.mock("../tour-sentinel", () => ({
  isTourCompleted: () => false,
  markTourCompleted: vi.fn(),
  isTourPending: () => false,
  clearTourPending: vi.fn(),
}))

// Minimal script: 5 steps on desktop (s1 d1 d2 d3 s2), 3 on mobile
// (s1 m1 s2) — flipping desktop→mobile mid-tour shrinks the array.
vi.mock("../tour-steps", () => {
  const mk = (id: string, platform?: "desktop" | "mobile") => ({
    id,
    navigateTo: null,
    anchor: null,
    title: id,
    body: id,
    ...(platform ? { platform } : {}),
  })
  return {
    TOUR_STEPS: [
      mk("s1"),
      mk("d1", "desktop"),
      mk("d2", "desktop"),
      mk("d3", "desktop"),
      mk("m1", "mobile"),
      mk("s2"),
    ],
  }
})

import { TourProvider, useTour } from "../tour-context"

beforeEach(() => {
  cleanup()
  layout.isDesktop = true
})

describe("TourProvider — steps array shrinks mid-tour", () => {
  it("exposes a clamped stepIndex so the last step reads as last", () => {
    const { result, rerender } = renderHook(() => useTour(), {
      wrapper: TourProvider,
    })

    act(() => result.current.start())
    act(() => {
      result.current.next()
      result.current.next()
      result.current.next()
      result.current.next()
    })
    expect(result.current.totalSteps).toBe(5)
    expect(result.current.stepIndex).toBe(4)
    expect(result.current.step?.id).toBe("s2")

    layout.isDesktop = false
    rerender()

    // Stored index 4 overflows the 3-step mobile array; the exposed
    // index must clamp to the new last step, keeping the card visible
    // and the isLast check (stepIndex === totalSteps - 1) truthful.
    expect(result.current.isActive).toBe(true)
    expect(result.current.totalSteps).toBe(3)
    expect(result.current.stepIndex).toBe(2)
    expect(result.current.step?.id).toBe("s2")
    expect(result.current.stepIndex).toBe(result.current.totalSteps - 1)
  })

  it("back() from an overflowed index steps once, not per overflow click", () => {
    const { result, rerender } = renderHook(() => useTour(), {
      wrapper: TourProvider,
    })

    act(() => result.current.start())
    act(() => {
      result.current.next()
      result.current.next()
      result.current.next()
      result.current.next()
    })

    layout.isDesktop = false
    rerender()
    expect(result.current.stepIndex).toBe(2)

    // One click must land on the step before the clamped position —
    // not silently burn clicks walking 4 → 3 → 2 inside the store.
    act(() => result.current.back())
    expect(result.current.stepIndex).toBe(1)
    expect(result.current.step?.id).toBe("m1")

    act(() => result.current.back())
    expect(result.current.stepIndex).toBe(0)
    expect(result.current.step?.id).toBe("s1")

    // Clamped at the first step.
    act(() => result.current.back())
    expect(result.current.stepIndex).toBe(0)
  })
})
