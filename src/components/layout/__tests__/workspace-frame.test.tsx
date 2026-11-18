import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"

import WorkspaceShell, { WorkspaceFrame } from "../workspace-shell"

// ---------------------------------------------------------------------------
// Mocks for the pages that use the frame (RecordsPage, Home).
// ---------------------------------------------------------------------------

const nav = { kind: "lists" }
const router = { replace: vi.fn(), push: vi.fn(), back: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => router,
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
 * The frame's order: the section's title (the page's visible h1, as on
 * the Network's pages), then the content. The page never lists the
 * Workspace's sections: the navigation does.
 */
function expectFrame(container: HTMLElement, opts: { h1?: string } = {}) {
  const main = container.querySelector(".workspace__main")
  expect(main).not.toBeNull()
  expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull()
  if (opts.h1) {
    const h1 = screen.getByRole("heading", { level: 1, name: opts.h1 })
    expect(h1).not.toHaveClass("sr-only")
    expect(h1).not.toHaveClass("md:sr-only")
    expect(h1.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main!.contains(h1)).toBe(false)
  }
  return { main: main as HTMLElement }
}

beforeEach(() => {
  router.replace.mockClear()
  nav.kind = "lists"
  auth.isLoading = false
  auth.isAuthenticated = true
  auth.did = "did:plc:me"
  org.activeOrg = null
  org.groups = []
  org.isLoading = false
})

describe("WorkspaceFrame", () => {
  it("renders the section's title, then the content, and no list of sections", () => {
    const { container } = render(
      <WorkspaceShell current="lists">
        <WorkspaceFrame titleId="lists-title">
          <p>Rows</p>
        </WorkspaceFrame>
      </WorkspaceShell>,
    )
    const { main } = expectFrame(container, { h1: "Lists" })
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("id", "lists-title")
    expect(within(main).getByText("Rows")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull()
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
  it("while auth loads: the section's title, a spinner", () => {
    auth.isLoading = true
    auth.isAuthenticated = false
    auth.did = null
    const { container } = render(<RecordsPage />)
    expectFrame(container, { h1: "Lists" })
  })

  it("signed out (while the redirect runs)", () => {
    auth.isAuthenticated = false
    auth.did = null
    nav.kind = "endorsements"
    const { container } = render(<RecordsPage />)
    expectFrame(container, { h1: "Endorsements" })
  })

  it("acting as a group", () => {
    org.activeOrg = {
      groupDid: "did:plc:group",
      handle: "group.certified.app",
      displayName: "Estuary",
      role: "admin",
    }
    nav.kind = "lists"
    const { container } = render(<RecordsPage />)
    const { main } = expectFrame(container, { h1: "Lists" })
    expect(
      within(main).getByRole("heading", { name: "Estuary's lists show on its profile" }),
    ).toBeInTheDocument()
  })

  // Endorsements shows the group's own while acting as it
  // (records/__tests__/group-sections.test.tsx); the other sections
  // explain where the group's records are.
  it("acting as a group, Lists and Projects and activities name their place on the group's profile", () => {
    org.activeOrg = {
      groupDid: "did:plc:group",
      handle: "group.certified.app",
      displayName: "Estuary",
      role: "admin",
    }
    // WS-06: the heading names the group; Projects and activities links
    // both of its profile tabs.
    const cases = [
      { kind: "lists", heading: "Estuary's lists show on its profile", links: [["Open lists", "lists"]] },
      {
        kind: "activities",
        heading: "Estuary's projects and activities show on its profile",
        links: [
          ["Open activities", "activities"],
          ["Open projects", "projects"],
        ],
      },
    ]
    for (const c of cases) {
      nav.kind = c.kind
      const { container, unmount } = render(<RecordsPage />)
      const main = container.querySelector(".workspace__main") as HTMLElement
      expect(within(main).getByRole("heading", { name: c.heading })).toBeInTheDocument()
      for (const [label, tab] of c.links) {
        expect(within(main).getByRole("link", { name: label })).toHaveAttribute(
          "href",
          `/group.certified.app?tab=${tab}`,
        )
      }
      expect(within(main).getByRole("button", { name: "Switch to personal account" })).toBeInTheDocument()
      // Only Projects and activities creates (as the group); its New
      // activity is the walk-through's anchor, the only one on the page.
      const creates = within(main).queryByRole("link", { name: "New activity" })
      if (c.kind === "activities") {
        expect(creates).toHaveAttribute("href", "/create")
        expect(creates).toHaveAttribute("data-tour", "records-new")
        expect(container.querySelectorAll('[data-tour="records-new"]')).toHaveLength(1)
        expect(within(main).getByRole("link", { name: "New project" })).toHaveAttribute("href", "/project/new")
      } else {
        expect(creates).toBeNull()
      }
      unmount()
    }
  })

  it("acting as a group with no display name: the heading names its @handle", () => {
    org.activeOrg = {
      groupDid: "did:plc:group",
      handle: "group.certified.app",
      displayName: "  ",
      role: "admin",
    }
    nav.kind = "lists"
    const { container } = render(<RecordsPage />)
    const main = container.querySelector(".workspace__main") as HTMLElement
    expect(
      within(main).getByRole("heading", { name: "@group.certified.app's lists show on its profile" }),
    ).toBeInTheDocument()
  })
})

describe("Overview renders the frame", () => {
  it("while auth loads: the title Overview, like every section, then a spinner", () => {
    auth.isLoading = true
    auth.isAuthenticated = false
    auth.did = null
    const { container } = render(<Home />)
    expectFrame(container, { h1: "Overview" })
  })
})

describe("Followers are on the profile", () => {
  it("old Followers links open the Followers tab of your profile", () => {
    nav.kind = "followers"
    render(<RecordsPage />)
    expect(router.replace).toHaveBeenCalledWith("/me.certified.app?tab=followers")
  })

  it("old Following links open its Following view", () => {
    nav.kind = "following"
    render(<RecordsPage />)
    expect(router.replace).toHaveBeenCalledWith("/me.certified.app?tab=followers&sub=following")
    router.replace.mockClear()
    nav.kind = "followers&tab=following"
    render(<RecordsPage />)
    expect(router.replace).toHaveBeenCalledWith("/me.certified.app?tab=followers&sub=following")
  })

  it("acting as a group, they open the group's profile", () => {
    org.activeOrg = {
      groupDid: "did:plc:group",
      handle: "group.certified.app",
      displayName: "Estuary",
      role: "admin",
    }
    nav.kind = "followers"
    render(<RecordsPage />)
    expect(router.replace).toHaveBeenCalledWith("/group.certified.app?tab=followers")
  })
})

describe("Groups left the Workspace", () => {
  it("old Groups links open the Overview", () => {
    nav.kind = "groups"
    render(<RecordsPage />)
    expect(router.replace).toHaveBeenCalledWith("/home")
  })
})
