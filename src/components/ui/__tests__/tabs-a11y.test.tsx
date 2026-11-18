import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Tabs, TabList, Tab, TabPanel } from "../tabs"

// A link tab's content is the page it opens, not a <TabPanel>, so it names
// no panel (an aria-controls to a missing id is invalid ARIA). Button tabs
// keep pointing at their panels. Underline tabs are at least 44px wide
// and draw their focus ring inside, where a scrolling strip can't clip it.

afterEach(() => {
  cleanup()
})

describe("Tab ARIA and touch size", () => {
  it("gives a link tab no aria-controls", () => {
    render(
      <Tabs value="overview" onChange={() => {}}>
        <TabList aria-label="Record sections">
          <Tab value="overview" href="/r?tab=overview">
            Overview
          </Tab>
          <Tab value="updates" href="/r?tab=updates">
            Updates
          </Tab>
        </TabList>
      </Tabs>,
    )
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).not.toHaveAttribute("aria-controls")
    }
  })

  it("points a button tab at its panel", () => {
    render(
      <Tabs value="a" onChange={() => {}}>
        <TabList aria-label="Sections">
          <Tab value="a">All</Tab>
          <Tab value="b">Bees</Tab>
        </TabList>
        <TabPanel value="a">Panel A</TabPanel>
      </Tabs>,
    )
    const tab = screen.getByRole("tab", { name: "All" })
    const panel = screen.getByRole("tabpanel")
    expect(tab.getAttribute("aria-controls")).toBe(panel.id)
    expect(panel).toHaveAttribute("aria-labelledby", tab.id)
  })

  it("makes an underline tab 44px wide at least, with an inset focus ring", () => {
    render(
      <Tabs value="a" onChange={() => {}}>
        <TabList aria-label="Sections">
          <Tab value="a">All</Tab>
        </TabList>
      </Tabs>,
    )
    const tab = screen.getByRole("tab", { name: "All" })
    expect(tab).toHaveClass("min-w-11", "justify-center", "focus-visible:outline-offset-[-2px]")
  })

  it("leaves segmented tabs as they were", () => {
    render(
      <Tabs value="a" onChange={() => {}} variant="segmented">
        <TabList aria-label="Sections">
          <Tab value="a">All</Tab>
        </TabList>
      </Tabs>,
    )
    expect(screen.getByRole("tab", { name: "All" })).not.toHaveClass("min-w-11")
  })
})
