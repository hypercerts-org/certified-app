import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

// The "Confirmed by" filter in the URL: each trusted source is its own
// choice, all of them on by default, and an old link's single `trusted`
// still means every source.

const nav = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/funding",
  useSearchParams: () => new URLSearchParams(nav.search),
}))

import { useFundingConfirmedBy } from "../use-funding-confirmed-by"

function setUrl(search: string) {
  nav.search = search
  window.history.replaceState(null, "", search ? `/funding?${search}` : "/funding")
}

const written = () => new URLSearchParams(window.location.search).get("confirmedRoles")

beforeEach(() => setUrl(""))

describe("useFundingConfirmedBy", () => {
  it("turns on every trusted source and both sides by default", () => {
    const { result } = renderHook(() => useFundingConfirmedBy())
    expect([...result.current.roles]).toEqual(["ma-earth", "gainforest", "both"])
    expect(result.current.isDefault).toBe(true)
  })

  it("turns one source off on its own", () => {
    const { result } = renderHook(() => useFundingConfirmedBy())
    act(() => result.current.toggleRole("gainforest"))
    expect(written()).toBe("ma-earth,both")
  })

  it("reads an old link's 'trusted' as every source", () => {
    setUrl("confirmedRoles=trusted,both,sender")
    const { result } = renderHook(() => useFundingConfirmedBy())
    expect(result.current.roles).toEqual(new Set(["ma-earth", "gainforest", "both", "sender"]))
    act(() => result.current.toggleRole("sender"))
    // Back to the default: no param.
    expect(written()).toBe(null)
  })

  it("writes the sources' own keys when an old link is changed", () => {
    setUrl("confirmedRoles=trusted")
    const { result } = renderHook(() => useFundingConfirmedBy())
    act(() => result.current.toggleRole("other"))
    expect(written()).toBe("ma-earth,gainforest,other")
  })
})
