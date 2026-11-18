import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Tabs, TabList, Tab } from "../tabs"

// The selected tab's label is semibold. Each string label carries a
// hidden bold copy of itself (`::after` from `data-label`) so its box is
// already as wide as the bold text, and selecting it doesn't shift the
// strip.
describe("Tab label width", () => {
  it("reserves the bold width of a string label on every tab", () => {
    render(
      <Tabs value="account" onChange={() => {}}>
        <TabList aria-label="Sections">
          <Tab value="account">Account</Tab>
          <Tab value="appearance" count={3}>
            Appearance
          </Tab>
        </TabList>
      </Tabs>,
    )

    for (const name of ["Account", /Appearance/]) {
      const tab = screen.getByRole("tab", { name })
      const label = tab.querySelector("[data-label]")
      expect(label).not.toBeNull()
      expect(label!.className).toContain("after:content-[attr(data-label)]")
      expect(label!.className).toContain("after:font-semibold")
      expect(label!.className).toContain("after:invisible")
    }
    expect(screen.getByRole("tab", { name: "Account" }).querySelector("[data-label]"))
      .toHaveAttribute("data-label", "Account")
    // The count stays outside the reserved label.
    const appearance = screen.getByRole("tab", { name: /Appearance/ })
    expect(appearance.querySelector("[data-label]")).toHaveTextContent(/^Appearance$/)
  })

  it("leaves a non-string label as it is", () => {
    render(
      <Tabs value="a" onChange={() => {}}>
        <TabList aria-label="Sections">
          <Tab value="a">
            <span>Rich</span>
          </Tab>
        </TabList>
      </Tabs>,
    )

    expect(screen.getByRole("tab", { name: "Rich" }).querySelector("[data-label]")).toBeNull()
  })
})
