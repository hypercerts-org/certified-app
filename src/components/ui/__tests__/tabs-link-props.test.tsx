import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

// tabs-133: `<Tab href>` link tabs can now forward Next navigation props
// (`scroll` / `replace` / `prefetch`) to the underlying <Link> via the
// scoped `linkProps`. Before this, TabProps only extended
// ButtonHTMLAttributes, so those router props could not flow through and
// URL-router strips had to fall back to button tabs driving the router
// from `onChange`.
//
// next/link is stubbed with an anchor that reflects the nav props it
// receives as data-* attributes, so we can assert they reached <Link>
// (Link consumes them, so they never appear on the real DOM <a>).

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    replace,
    scroll,
    prefetch,
    children,
    ...rest
  }: {
    href: string | { toString(): string }
    replace?: boolean
    scroll?: boolean
    prefetch?: boolean
    children: React.ReactNode
  } & Record<string, unknown>) => (
    <a
      href={typeof href === "string" ? href : String(href)}
      data-replace={String(replace)}
      data-scroll={String(scroll)}
      data-prefetch={String(prefetch)}
      {...rest}
    >
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
})

describe("Tab href forwards Next navigation linkProps", () => {
  it("renders an anchor and forwards replace + scroll to <Link>", async () => {
    const { Tabs, TabList, Tab } = await import("../tabs")
    render(
      <Tabs value="a" onChange={() => {}}>
        <TabList aria-label="Sections">
          <Tab
            value="a"
            href="/x?tab=a"
            linkProps={{ replace: true, scroll: false }}
          >
            A
          </Tab>
          <Tab
            value="b"
            href="/x?tab=b"
            linkProps={{ replace: true, scroll: false }}
          >
            B
          </Tab>
        </TabList>
      </Tabs>,
    )

    const tabA = screen.getByRole("tab", { name: "A" })
    expect(tabA.tagName).toBe("A")
    expect(tabA.getAttribute("href")).toBe("/x?tab=a")
    expect(tabA.getAttribute("data-replace")).toBe("true")
    expect(tabA.getAttribute("data-scroll")).toBe("false")

    // The ARIA + roving-tabindex contract is unchanged on the link tab.
    expect(tabA.getAttribute("aria-selected")).toBe("true")
    expect(tabA.getAttribute("tabindex")).toBe("0")
    const tabB = screen.getByRole("tab", { name: "B" })
    expect(tabB.getAttribute("aria-selected")).toBe("false")
    expect(tabB.getAttribute("tabindex")).toBe("-1")
  })

  it("does not leak linkProps / anchor props onto button tabs", async () => {
    const { Tabs, TabList, Tab } = await import("../tabs")
    render(
      <Tabs value="a" onChange={() => {}}>
        <TabList aria-label="Sections">
          <Tab value="a">A</Tab>
        </TabList>
      </Tabs>,
    )

    const tabA = screen.getByRole("tab", { name: "A" })
    expect(tabA.tagName).toBe("BUTTON")
    expect(tabA.getAttribute("data-replace")).toBeNull()
    expect(tabA.getAttribute("href")).toBeNull()
  })
})
