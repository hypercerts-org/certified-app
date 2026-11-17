import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("@/lib/navbar-context", () => ({ useRegisterPageHeader: () => {} }))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", pdsUrl: null }),
}))
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "ada.certified.app", email: "ada@example.com" }),
}))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ selfGroup: null }) }))
vi.mock("@/components/ui/theme-toggle", () => ({ default: () => <div>Theme picker</div> }))
vi.mock("@/components/settings/look-picker", () => ({ default: () => <div>Style gallery</div> }))
vi.mock("@/components/settings/custom-look-maker", () => ({
  default: () => <label>Claude API key<input /></label>,
}))
vi.mock("@/components/settings/look-run", () => ({
  LookRunProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/settings/sync-social-graph-section", () => ({ default: () => null }))
vi.mock("@/components/settings/import-as-group-section", () => ({ default: () => null }))
vi.mock("@/components/settings/app-passwords-section", () => ({ default: () => null }))
vi.mock("@/components/account/did-section", () => ({ default: () => null }))

import SettingsPanel from "../settings-panel"

beforeEach(() => {
  window.history.replaceState(null, "", "/settings#appearance")
})

describe("Settings › Appearance", () => {
  it("shows the theme, and keeps the experimental styles closed", () => {
    render(<SettingsPanel />)

    expect(screen.getByText("Theme picker")).toBeInTheDocument()
    const toggle = screen.getByRole("button", { name: /Show styles/ })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("group", { name: "Experimental styles" })).toBeInTheDocument()
    expect(screen.queryByText("Style gallery")).toBeNull()
    expect(screen.queryByLabelText("Claude API key")).toBeNull()
  })

  it("opens the styles, the maker and its key field on request", () => {
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole("button", { name: /Show styles/ }))

    const toggle = screen.getByRole("button", { name: /Hide styles/ })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)
    expect(region).toContainElement(screen.getByText("Style gallery"))
    expect(screen.getByLabelText("Claude API key")).toBeInTheDocument()
  })
})
