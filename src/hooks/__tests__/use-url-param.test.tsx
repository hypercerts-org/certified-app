import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"

// Mock next/navigation BEFORE importing the hook. We control
// pathname / searchParams via mutable test state, and capture the
// router method calls per test for assertions.
const mockState = {
  pathname: "/explore",
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}

vi.mock("next/navigation", () => ({
  usePathname: () => mockState.pathname,
  useRouter: () => ({
    push: mockState.push,
    replace: mockState.replace,
  }),
  useSearchParams: () => mockState.searchParams,
}))

import { useUrlParam } from "../use-url-param"

beforeEach(() => {
  cleanup()
  mockState.pathname = "/explore"
  mockState.searchParams = new URLSearchParams()
  mockState.push.mockReset()
  mockState.replace.mockReset()
})

describe("useUrlParam — read path", () => {
  it("returns the param value when present in the URL", () => {
    mockState.searchParams = new URLSearchParams("filter=ma-earth")
    const { result } = renderHook(() => useUrlParam("filter"))
    expect(result.current[0]).toBe("ma-earth")
  })

  it("returns the default when the param is missing", () => {
    const { result } = renderHook(() =>
      useUrlParam("filter", { defaultValue: "all" }),
    )
    expect(result.current[0]).toBe("all")
  })

  it("returns null when neither the param nor a default is set", () => {
    const { result } = renderHook(() => useUrlParam("filter"))
    expect(result.current[0]).toBeNull()
  })
})

describe("useUrlParam — write path", () => {
  it("writes ?key=value via router.replace by default", () => {
    const { result } = renderHook(() => useUrlParam("filter"))
    act(() => result.current[1]("ma-earth"))
    expect(mockState.replace).toHaveBeenCalledWith(
      "/explore?filter=ma-earth",
      { scroll: false },
    )
    expect(mockState.push).not.toHaveBeenCalled()
  })

  it("uses router.push when mode is push", () => {
    const { result } = renderHook(() =>
      useUrlParam("filter", { mode: "push" }),
    )
    act(() => result.current[1]("ma-earth"))
    expect(mockState.push).toHaveBeenCalledWith(
      "/explore?filter=ma-earth",
      { scroll: false },
    )
  })

  it("a per-call mode override beats the default", () => {
    const { result } = renderHook(() => useUrlParam("filter"))
    act(() => result.current[1]("x", "push"))
    expect(mockState.push).toHaveBeenCalledTimes(1)
    expect(mockState.replace).not.toHaveBeenCalled()
  })

  it("drops the param when next === null", () => {
    mockState.searchParams = new URLSearchParams("filter=x&other=y")
    const { result } = renderHook(() => useUrlParam("filter"))
    act(() => result.current[1](null))
    expect(mockState.replace).toHaveBeenCalledWith("/explore?other=y", {
      scroll: false,
    })
  })

  it("drops the param when next equals the default value", () => {
    mockState.searchParams = new URLSearchParams("filter=x&other=y")
    const { result } = renderHook(() =>
      useUrlParam("filter", { defaultValue: "all" }),
    )
    act(() => result.current[1]("all"))
    expect(mockState.replace).toHaveBeenCalledWith("/explore?other=y", {
      scroll: false,
    })
  })

  it("drops empty string when defaultValue is nullish", () => {
    mockState.searchParams = new URLSearchParams("filter=x")
    const { result } = renderHook(() => useUrlParam("filter"))
    act(() => result.current[1](""))
    expect(mockState.replace).toHaveBeenCalledWith("/explore", {
      scroll: false,
    })
  })

  it("PRESERVES empty string when defaultValue is non-nullish (M1)", () => {
    // The Pass 9 M1 fix — `?quality=` is a meaningful "show nothing"
    // sentinel when the default is something else (e.g. "all").
    mockState.searchParams = new URLSearchParams()
    const { result } = renderHook(() =>
      useUrlParam("quality", { defaultValue: "all" }),
    )
    act(() => result.current[1](""))
    expect(mockState.replace).toHaveBeenCalledWith("/explore?quality=", {
      scroll: false,
    })
  })

  it("strips the trailing ? when no params remain", () => {
    mockState.searchParams = new URLSearchParams("filter=x")
    const { result } = renderHook(() => useUrlParam("filter"))
    act(() => result.current[1](null))
    // After dropping `filter`, qs is empty → router target is "/explore"
    // with no ?, not "/explore?".
    expect(mockState.replace).toHaveBeenCalledWith("/explore", {
      scroll: false,
    })
  })

  it("preserves other params when updating one", () => {
    mockState.searchParams = new URLSearchParams("filter=x&other=y")
    const { result } = renderHook(() => useUrlParam("filter"))
    act(() => result.current[1]("z"))
    const target = mockState.replace.mock.calls[0][0] as string
    // URLSearchParams doesn't guarantee ordering across browsers; assert
    // both params exist regardless of order.
    const params = new URLSearchParams(target.split("?")[1])
    expect(params.get("filter")).toBe("z")
    expect(params.get("other")).toBe("y")
  })
})
