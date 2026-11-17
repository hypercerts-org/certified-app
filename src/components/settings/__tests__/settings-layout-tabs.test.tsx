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

// The sections are a tab strip under the title (no second menu beside the
// app's sidebar); picking one swaps the panel in place.
describe("SettingsLayout tabs", () => {
  it("leaves focus alone on first render", () => {
    render(<Harness />)
    expect(document.activeElement).toBe(document.body)
  })

  it("shows the sections as tabs, the open one selected, its panel named by it", () => {
    render(<Harness />)
    const list = screen.getByRole("tablist", { name: "Settings sections" })
    expect(list).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel", { name: "Account" })).toHaveTextContent("Control in Account")
    // No side list of sections any more.
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull()
  })

  it("opens a section from its tab", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }))
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel", { name: "Appearance" })).toHaveTextContent("Control in Appearance")
    // The section keeps a heading for the outline.
    expect(screen.getByRole("heading", { level: 2, name: "Appearance" })).toBeInTheDocument()
  })
})
