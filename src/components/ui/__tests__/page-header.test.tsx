import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const nav = vi.hoisted(() => ({ pathname: null as string | null }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))

import PageHeader from "../page-header"
import { NavbarProvider, useHasPageHeader, useNavbarValues } from "@/lib/navbar-context"

beforeEach(() => {
  nav.pathname = null
})

function BarTitleProbe() {
  return <span data-testid="bar-title">{useNavbarValues().barTitle ?? ""}</span>
}

// Reads the chrome side of the h1 contract: what the navbar would check
// before rendering its own h1.
function ChromeProbe() {
  const has = useHasPageHeader()
  return <span data-testid="has-page-header">{String(has)}</span>
}

describe("PageHeader", () => {
  it("renders the title as the page's h1, with description, actions and back link", () => {
    render(
      <NavbarProvider>
        <PageHeader
          title="Records"
          titleId="records-title"
          description="Everything your account holds."
          back={{ href: "/home", label: "Home" }}
          actions={<button type="button">New activity</button>}
        />
      </NavbarProvider>,
    )

    const h1 = screen.getByRole("heading", { level: 1, name: "Records" })
    expect(h1).toHaveAttribute("id", "records-title")
    expect(screen.getByText("Everything your account holds.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New activity" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home")
    // Exactly one h1 on the page.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  })

  it("on a top-level page, hands its title to the phone bar and hides its h1 on phones", () => {
    nav.pathname = "/feed"
    render(
      <NavbarProvider>
        <BarTitleProbe />
        <PageHeader title="Feed" description="What's happening." />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("bar-title")).toHaveTextContent("Feed")
    expect(screen.getByRole("heading", { level: 1, name: "Feed" })).toHaveClass("max-[799px]:sr-only")
  })

  it("keeps its title elsewhere, and with its own back link", () => {
    nav.pathname = "/maya.certified.app/activity/3k2"
    const { rerender } = render(
      <NavbarProvider>
        <BarTitleProbe />
        <PageHeader title="Mangrove replanting" />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("bar-title")).toHaveTextContent("")
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("max-[799px]:sr-only")
    nav.pathname = "/settings"
    rerender(
      <NavbarProvider>
        <BarTitleProbe />
        <PageHeader title="Settings" back={{ href: "/home", label: "Home" }} />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("bar-title")).toHaveTextContent("")
  })

  it("registers with the navbar context while mounted", () => {
    const { rerender } = render(
      <NavbarProvider>
        <ChromeProbe />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("has-page-header")).toHaveTextContent("false")

    rerender(
      <NavbarProvider>
        <ChromeProbe />
        <PageHeader title="Feed" />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("has-page-header")).toHaveTextContent("true")

    rerender(
      <NavbarProvider>
        <ChromeProbe />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("has-page-header")).toHaveTextContent("false")
  })

  it("is ref-counted: unmounting one of two headers keeps the flag", () => {
    const { rerender } = render(
      <NavbarProvider>
        <ChromeProbe />
        <PageHeader key="a" title="A" />
        <PageHeader key="b" title="B" />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("has-page-header")).toHaveTextContent("true")

    rerender(
      <NavbarProvider>
        <ChromeProbe />
        <PageHeader key="a" title="A" />
      </NavbarProvider>,
    )
    expect(screen.getByTestId("has-page-header")).toHaveTextContent("true")
  })
})
