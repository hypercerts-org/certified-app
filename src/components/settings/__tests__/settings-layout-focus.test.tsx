import { describe, it, expect, vi, afterEach } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { CircleUser, Palette } from "lucide-react"
import SettingsLayout, { type SettingsSectionDef } from "../settings-layout"

vi.mock("@/lib/navbar-context", () => ({
  useRegisterPageHeader: () => {},
}))

type Key = "account" | "appearance"

const SECTIONS: SettingsSectionDef<Key>[] = [
  { key: "account", label: "Account", icon: CircleUser },
  { key: "appearance", label: "Appearance", icon: Palette },
]

function Harness() {
  const [current, setCurrent] = useState<Key>("account")
  const section = SECTIONS.find((s) => s.key === current)!
  return (
    <SettingsLayout
      description="Settings for your account."
      navLabel="Settings sections"
      sections={SECTIONS}
      current={current}
      onSelect={setCurrent}
      title={section.label}
    >
      <button type="button">Control in {section.label}</button>
    </SettingsLayout>
  )
}

afterEach(() => cleanup())

// a11y: picking a section swaps the content in place, so focus moves to the
// new section's heading; a screen-reader user hears which section opened.
describe("SettingsLayout section focus", () => {
  it("leaves focus alone on first render", () => {
    render(<Harness />)
    expect(document.activeElement).toBe(document.body)
  })

  it("moves focus to the new section's heading when a section is picked", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("link", { name: "Appearance" }))
    const heading = screen.getByRole("heading", { level: 2, name: "Appearance" })
    expect(document.activeElement).toBe(heading)
    // Focusable from script only, not a Tab stop.
    expect(heading).toHaveAttribute("tabindex", "-1")
  })

  it("focuses the heading when the current section is picked again", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("link", { name: "Account" }))
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 2, name: "Account" }),
    )
  })
})
