import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"

import WorkspaceShell, { WorkspaceFrame } from "../workspace-shell"
import { SIDE_NAV_CONTENT_OFFSET } from "@/components/ui/side-nav"

// ---------------------------------------------------------------------------
// Mocks for the pages that use the frame (RecordsPage, Home).
// ---------------------------------------------------------------------------

const nav = { kind: "groups" }
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`kind=${nav.kind}`),
  usePathname: () => "/records",
}))

const auth = { isLoading: false, isAuthenticated: true, did: "did:plc:me" as string | null }
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => auth,
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "me.certified.app" }),
}))

const org = {
  activeOrg: null as null | { groupDid: string; handle: string; displayName: string; role: string },
  groups: [] as unknown[],
  isLoading: false,
}
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => org,
}))

vi.mock("@/lib/groups/use-switch-actor", () => ({
  useSwitchActor: () => vi.fn(),
}))

vi.mock("@/hooks/use-following", () => ({
  useFollowing: () => ({ subjects: new Set(), records: [], count: 0, isLoading: false }),
}))

vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => ({ endorsements: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

// Imported after the mocks.
import RecordsPage from "@/components/records/records-page"
import Home from "@/components/home/home"

/**
 * The frame's order: the page's h1 (the section's name, for screen
 * readers only: the side list names the page), then the Workspace side
 * list, then the content. No title is drawn over the frame.
 */
function expectFrame(container: HTMLElement, opts: { h1?: string } = {}) {
  const sideList = screen.getByRole("navigation", { name: "Workspace" })
  const main = container.querySelector(".workspace__main")
  expect(main).not.toBeNull()
  expect(container.querySelector(".workspace__header")).toBeNull()
  expect(sideList.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  if (opts.h1) {
    const h1 = screen.getByRole("heading", { level: 1, name: opts.h1 })
    // The page title on phones (no section list there), for screen readers
    // only from 800px, where the list names the page.
    expect(h1).toHaveClass("md:sr-only")
    expect(h1.compareDocumentPosition(sideList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main!.contains(h1)).toBe(false)
  }
  return { sideList, main: main as HTMLElement }
}

beforeEach(() => {
  nav.kind = "groups"
  auth.isLoading = false
  auth.isAuthenticated = true
  auth.did = "did:plc:me"
  org.activeOrg = null
  org.groups = []
  org.isLoading = false
})

describe("WorkspaceFrame", () => {
  it("renders the section's h1 (for screen readers), then the side list, then the content", () => {
    const { container } = render(
      <WorkspaceShell current="followers">
        <WorkspaceFrame titleId="followers-title">
          <p>Rows</p>
        </WorkspaceFrame>
      </WorkspaceShell>,
    )
    const { main, sideList } = expectFrame(container, { h1: "Followers" })
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("id", "followers-title")
    expect(within(main).getByText("Rows")).toBeInTheDocument()
    expect(within(sideList).getByRole("link", { name: "Followers" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(within(sideList).getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    )
  })

  it("offsets the content to the first side-list label unless told not to", () => {
    const { container, rerender } = render(
      <WorkspaceShell current="overview">
        <WorkspaceFrame>x</WorkspaceFrame>
      </WorkspaceShell>,
    )
    const offset = SIDE_NAV_CONTENT_OFFSET.split(" ")[0]
    expect(container.querySelector(".workspace__main")).toHaveClass(offset)
    rerender(
      <WorkspaceShell current="overview">
        <WorkspaceFrame offset={false}>
          x
        </WorkspaceFrame>
      </WorkspaceShell>,
    )
    expect(container.querySelector(".workspace__main")).not.toHaveClass(offset)
  })

  it("must sit inside WorkspaceShell", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<WorkspaceFrame>x</WorkspaceFrame>)).toThrow(
      /inside WorkspaceShell/,
    )
    spy.mockRestore()
  })
})

describe("Records sections render the frame in every state", () => {
  it("while auth loads: the section's h1, the side list, a spinner", () => {
    auth.isLoading = true
    auth.isAuthenticated = false
    auth.did = null
    const { container } = render(<RecordsPage />)
    expectFrame(container, { h1: "Groups" })
  })

  it("signed out (while the redirect runs)", () => {
    auth.isAuthenticated = false
    auth.did = null
    nav.kind = "followers"
    const { container } = render(<RecordsPage />)
    expectFrame(container, { h1: "Followers" })
  })

  it("acting as a group", () => {
    org.activeOrg = {
      groupDid: "did:plc:group",
      handle: "group.certified.app",
      displayName: "Estuary",
      role: "admin",
    }
    nav.kind = "endorsements"
    const { container } = render(<RecordsPage />)
    const { main } = expectFrame(container, { h1: "Endorsements" })
    expect(
      within(main).getByRole("heading", { name: "This group's records are on its profile" }),
    ).toBeInTheDocument()
  })

  it("a section: its h1, the side list, and its region named by the h1", () => {
    org.groups = []
    const { container } = render(<RecordsPage />)
    const { main } = expectFrame(container, { h1: "Groups" })
    const h1 = screen.getByRole("heading", { level: 1, name: "Groups" })
    // The pane's region lives in the content and points at the h1.
    const region = within(main).getByRole("region", { name: "Groups" })
    expect(region).toHaveAttribute("aria-labelledby", h1.id)
    // With no groups, New group is the empty state's own action.
    expect(within(main).getByRole("link", { name: "New group" })).toBeInTheDocument()
  })

  it("a section with groups: their count and New group make its first row", () => {
    org.groups = [
      { groupDid: "did:plc:a", handle: "a.certified.app", displayName: "Estuary", role: "admin" },
      { groupDid: "did:plc:b", handle: "b.certified.app", displayName: "Mangrove", role: "member" },
    ]
    const { container } = render(<RecordsPage />)
    const { main } = expectFrame(container, { h1: "Groups" })
    const row = main.querySelector(".records-pane__headrow") as HTMLElement
    expect(within(row).getByText("2 groups")).toBeInTheDocument()
    expect(within(row).getByRole("link", { name: "New group" })).toBeInTheDocument()
  })

  it("a section while its list loads", () => {
    org.isLoading = true
    const { container } = render(<RecordsPage />)
    expectFrame(container, { h1: "Groups" })
  })
})

describe("Overview renders the frame", () => {
  it("while auth loads: no section h1 (the account heads the ID box), the side list, a spinner", () => {
    auth.isLoading = true
    auth.isAuthenticated = false
    auth.did = null
    const { container } = render(<Home />)
    expect(container.querySelector("h1")).toBeNull()
    const sideList = screen.getByRole("navigation", { name: "Workspace" })
    const main = container.querySelector(".workspace__main")!
    expect(sideList.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(sideList).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
})
