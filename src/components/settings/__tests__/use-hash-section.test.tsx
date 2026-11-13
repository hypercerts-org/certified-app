import { describe, it, expect, afterEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"
import { useHashSection } from "../settings-layout"

// The settings sections are addressed by URL hash: deep links, the product
// tour (`window.location.hash = …`) and the promote-to-group hand-off
// (`#members`) all rely on it.
const KEYS = ["account", "appearance", "app-passwords"] as const
const ALIASES = { email: "account", theme: "appearance" } as const

function setHash(hash: string) {
  window.history.replaceState(null, "", `/settings${hash}`)
}

afterEach(() => {
  cleanup()
  setHash("")
})

describe("useHashSection", () => {
  it("reads the section from the hash on mount", () => {
    setHash("#app-passwords")
    const { result } = renderHook(() => useHashSection(KEYS, ALIASES))
    expect(result.current[0]).toBe("app-passwords")
  })

  it("maps old per-field links onto the section that holds them", () => {
    setHash("#email")
    const { result } = renderHook(() => useHashSection(KEYS, ALIASES))
    expect(result.current[0]).toBe("account")
  })

  it("returns null for a hash that names no section", () => {
    setHash("#members")
    const { result } = renderHook(() => useHashSection(KEYS, ALIASES))
    expect(result.current[0]).toBeNull()
  })

  it("follows hash changes made from outside", () => {
    setHash("")
    const { result } = renderHook(() => useHashSection(KEYS, ALIASES))
    expect(result.current[0]).toBeNull()
    act(() => {
      setHash("#appearance")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(result.current[0]).toBe("appearance")
  })

  it("selecting a section replaces the hash without a new history entry", () => {
    setHash("")
    const before = window.history.length
    const { result } = renderHook(() => useHashSection(KEYS, ALIASES))
    act(() => result.current[1]("appearance"))
    expect(result.current[0]).toBe("appearance")
    expect(window.location.hash).toBe("#appearance")
    expect(window.location.pathname).toBe("/settings")
    expect(window.history.length).toBe(before)
  })
})
