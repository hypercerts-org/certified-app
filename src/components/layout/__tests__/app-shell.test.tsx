import { describe, it, expect, vi, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

// <main> is at least a screen tall (.app-main), so the footer never fills
// the first screen while a page loads; embeds (no footer) are left alone.
// On the legal pages the footer sits in .editorial-footer, which gives it
// the landing top bar's edges.

const state = vi.hoisted(() => ({ pathname: "/explore" }))

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }))
vi.mock("@/lib/navbar-context", () => ({
  useNavbarContext: () => ({ profileOverlay: false }),
}))
vi.mock("@/components/layout/site-footer", () => ({
  default: () => <footer className="site-footer" />,
}))

import AppShell from "../app-shell"

afterEach(() => {
  cleanup()
})

function renderAt(pathname: string) {
  state.pathname = pathname
  return render(
    <AppShell>
      <p>Page</p>
    </AppShell>,
  )
}

describe("AppShell", () => {
  it("holds the footer past the first screen on app, landing and legal pages", () => {
    for (const path of ["/explore", "/welcome", "/terms"]) {
      const { container, unmount } = renderAt(path)
      expect(container.querySelector("main#main-content")).toHaveClass("app-main")
      unmount()
    }
  })

  it("leaves an embed's main as it is", () => {
    const { container } = renderAt("/embed/graph")
    expect(container.querySelector("main#main-content")).not.toHaveClass("app-main")
    expect(container.querySelector(".site-footer")).toBeNull()
  })

  it("wraps the legal pages' footer so it takes the top bar's edges", () => {
    const { container } = renderAt("/terms")
    expect(container.querySelector(".editorial-footer > .site-footer")).not.toBeNull()
  })
})
