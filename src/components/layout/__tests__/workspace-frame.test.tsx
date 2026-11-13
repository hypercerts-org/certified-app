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
 * The frame's order: the header (with the page's h1, when it has one),
 * then the Workspace side list, then the content.
 */
function expectFrame(container: HTMLElement, opts: { h1?: string } = {}) {
  const header = container.querySelector(".workspace__header")
  const sideList = screen.getByRole("navigation", { name: "Workspace" })
  const main = container.querySelector(".workspace__main")
  expect(header).not.toBeNull()
  expect(main).not.toBeNull()
  // header → side list → content, in document order.
  expect(header!.compareDocumentPosition(sideList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(sideList.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // The header sits outside the side list's row; the list is not in it.
  expect(header!.contains(sideList)).toBe(false)
  if (opts.h1) {
    expect(within(header as HTMLElement).getByRole("heading", { level: 1, name: opts.h1 })).toBeInTheDocument()
  }
  return { header: header as HTMLElement, sideList, main: main as HTMLElement }
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
  it("renders the header, then the side list, then the content", () => {
    const { container } = render(
      <WorkspaceShell current="followers">
        <WorkspaceFrame header={<h1>Followers</h1>}>
          <p>Rows</p>
        </WorkspaceFrame>
      </WorkspaceShell>,
    )
    const { main, sideList } = expectFrame(container, { h1: "Followers" })
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
        <WorkspaceFrame header={null}>x</WorkspaceFrame>
      </WorkspaceShell>,
    )
    const offset = SIDE_NAV_CONTENT_OFFSET.split(" ")[0]
    expect(container.querySelector(".workspace__main")).toHaveClass(offset)
    rerender(
      <WorkspaceShell current="overview">
        <WorkspaceFrame header={null} offset={false}>
          x
        </WorkspaceFrame>
      </WorkspaceShell>,
    )
    expect(container.querySelector(".workspace__main")).not.toHaveClass(offset)
  })

  it("must sit inside WorkspaceShell", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<WorkspaceFrame header={null}>x</WorkspaceFrame>)).toThrow(
      /inside WorkspaceShell/,
    )
    spy.mockRestore()
  })
})

describe("Records sections render the frame in every state", () => {
  it("while auth loads: the section's header, the side list, a spinner", () => {
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

  it("a section: its header, the side list, and its region named by the header's title", () => {
    org.groups = []
    const { container } = render(<RecordsPage />)
    const { main } = expectFrame(container, { h1: "Groups" })
    const h1 = screen.getByRole("heading", { level: 1, name: "Groups" })
    // The pane's region lives in the content and points at the header's h1.
    const region = within(main).getByRole("region", { name: "Groups" })
    expect(region).toHaveAttribute("aria-labelledby", h1.id)
    // New group stays in the header.
    expect(screen.getByRole("link", { name: "New group" })).toBeInTheDocument()
  })

  it("a section while its list loads", () => {
    org.isLoading = true
    const { container } = render(<RecordsPage />)
    expectFrame(container, { h1: "Groups" })
  })
})

describe("Overview renders the frame", () => {
  it("while auth loads: no header (the account heads the ID box), the side list, a spinner", () => {
    auth.isLoading = true
    auth.isAuthenticated = false
    auth.did = null
    const { container } = render(<Home />)
    expect(container.querySelector(".workspace__header")).toBeNull()
    const sideList = screen.getByRole("navigation", { name: "Workspace" })
    const main = container.querySelector(".workspace__main")!
    expect(sideList.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(sideList).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
})
