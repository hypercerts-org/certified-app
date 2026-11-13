import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import PageHeader from "../page-header"
import { NavbarProvider, useHasPageHeader } from "@/lib/navbar-context"

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
