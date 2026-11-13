import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

import AppTile from "../app-tile"
import { CONNECTED_APPS } from "@/lib/constants/apps"

// The tile's link reads the session to decide whether to deep-link a
// signed-in viewer through the partner's SSO endpoint.
const sessionMock = vi.fn(() => ({ handle: null as string | null }))
vi.mock("@/hooks/use-session", () => ({
  useSession: () => sessionMock(),
}))

afterEach(() => {
  cleanup()
  sessionMock.mockReset()
  sessionMock.mockImplementation(() => ({ handle: null }))
})

const plainApp = CONNECTED_APPS.find((a) => !("ssoHandleUrl" in a))!
const ssoApp = CONNECTED_APPS.find((a) => "ssoHandleUrl" in a)!

describe("AppTile", () => {
  it("is one link to the app that opens in a new tab", () => {
    render(<AppTile app={plainApp} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe(plainApp.url)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    expect(link.textContent).toContain(plainApp.name)
    expect(link.textContent).toContain(plainApp.desc)
    expect(link.textContent).toContain("(opens in new tab)")
  })

  it("puts every logo on the same 44px sunken plate, at both sizes", () => {
    for (const app of CONNECTED_APPS) {
      for (const size of ["sm", "lg"] as const) {
        const { container, unmount } = render(<AppTile app={app} size={size} />)
        const img = container.querySelector("img")!
        const plate = img.parentElement!
        expect(plate.className, `${app.name} ${size}`).toContain("bg-[var(--bg-sunken)]")
        expect(plate.className, `${app.name} ${size}`).toContain("h-11 w-11")
        expect(img.className, `${app.name} ${size}`).toContain("object-contain")
        expect(img.className, app.name).not.toContain("--color-white")
        unmount()
      }
    }
  })

  it("flips only the black one-colour mark in dark mode", () => {
    for (const app of CONNECTED_APPS) {
      const { container, unmount } = render(<AppTile app={app} />)
      const img = container.querySelector("img")!
      const mono = "monochromeLogo" in app && app.monochromeLogo
      expect(img.className.includes("dark:invert"), app.name).toBe(!!mono)
      unmount()
    }
    expect(
      CONNECTED_APPS.filter((a) => "monochromeLogo" in a && a.monochromeLogo).map((a) => a.name),
    ).toEqual(["Hyperboards"])
  })

  it("balances the tagline, so a wrapped one leaves no single word on its second line", () => {
    render(<AppTile app={plainApp} />)
    expect(screen.getByText(plainApp.desc).className).toContain("text-balance")
  })

  it("shows the long description only when asked", () => {
    const { rerender } = render(<AppTile app={plainApp} />)
    expect(screen.queryByText(plainApp.longDesc)).toBeNull()
    rerender(<AppTile app={plainApp} size="lg" showLongDescription />)
    expect(screen.getByText(plainApp.longDesc)).toBeTruthy()
  })

  it("signs a signed-in viewer straight in where the app supports it", () => {
    sessionMock.mockImplementation(() => ({ handle: "ada.certified.app" }))
    render(<AppTile app={ssoApp} />)
    const href = screen.getByRole("link").getAttribute("href")
    expect(href).toBe(
      ("ssoHandleUrl" in ssoApp ? ssoApp.ssoHandleUrl : "") +
        encodeURIComponent("ada.certified.app"),
    )
  })

  it("falls back to the app's site for a signed-out viewer", () => {
    render(<AppTile app={ssoApp} />)
    expect(screen.getByRole("link").getAttribute("href")).toBe(ssoApp.url)
  })
})
