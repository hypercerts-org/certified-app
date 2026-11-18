import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

// The Overview's order and the compact Apps list. The sections are stubbed
// for the order test; HomeApps renders for real.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isLoading: false, isAuthenticated: true, did: "did:plc:me" }),
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "me.certified.app" }),
}))

const org = { activeOrg: null as null | { groupDid: string; handle: string; displayName: string; role: string } }
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ ...org, groups: [], isLoading: false }),
}))

vi.mock("@/hooks/use-user-profile", () => ({
  useUserProfile: () => ({ profile: null, avatarUrl: null, handle: "me.certified.app", isLoading: false }),
}))

vi.mock("@/hooks/use-workspace", () => ({
  useActorWorkspaceCounts: () => ({ counts: {}, isLoading: false }),
}))

vi.mock("@/components/home/home-account-card", () => ({
  HomeAccountIdentity: () => <p>Identity</p>,
  HomeIdSection: () => <p>ID</p>,
}))

vi.mock("@/components/home/home-sections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/home/home-sections")>()
  return {
    ...actual,
    HomeRecords: () => <h2>Your records</h2>,
    HomeEndorsements: () => <h2>Endorsements and followers</h2>,
    HomeGroups: () => <h2>Your groups</h2>,
    HomeApps: () => <h2>Apps</h2>,
  }
})

import Home from "../home"
import { HomeApps } from "../home-sections"
import { CONNECTED_APPS } from "@/lib/constants/apps"

afterEach(() => {
  cleanup()
  org.activeOrg = null
})

describe("Overview order", () => {
  // W3: below 1100px (one column, the DOM order) what the account holds
  // comes first; the ID and groups boxes follow, then Apps. WS-03: the ID
  // box is before Your groups in the DOM too, the order the side column
  // shows them from 1100px, so the keyboard follows the page at every
  // width (no CSS reordering).
  it("puts the sections first, then the ID box, Your groups and Apps", () => {
    const { container } = render(<Home />)
    const order = Array.from(container.querySelectorAll(".home__layout h2, .home__layout [data-centerpiece='id']")).map(
      (el) => (el.matches("[data-centerpiece='id']") ? "ID box" : el.textContent),
    )
    expect(order).toEqual([
      "Your records",
      "Endorsements and followers",
      "ID box",
      "Your groups",
      "Apps",
    ])
    expect(container.querySelector("[data-centerpiece='id']")).toHaveClass("home__box--id")
  })

  it("acting as a group: no Your groups, the ID box still after the sections", () => {
    org.activeOrg = { groupDid: "did:plc:group", handle: "group.certified.app", displayName: "Estuary", role: "owner" }
    render(<Home />)
    expect(screen.queryByRole("heading", { name: "Your groups" })).toBeNull()
    const endorsements = screen.getByRole("heading", { name: "Endorsements and followers" })
    const id = document.querySelector("[data-centerpiece='id']")!
    expect(endorsements.compareDocumentPosition(id) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("Overview Apps", () => {
  it("lists each app as one compact row (name and tagline) and ends with All apps", async () => {
    const { HomeApps: RealHomeApps } = await vi.importActual<typeof import("../home-sections")>("../home-sections")
    expect(HomeApps).not.toBe(RealHomeApps)
    render(<RealHomeApps />)
    const section = screen.getByRole("region", { name: "Apps" })
    const rows = within(section).getAllByRole("listitem")
    expect(rows).toHaveLength(CONNECTED_APPS.length)
    const first = CONNECTED_APPS[0]
    const link = within(rows[0]).getByRole("link")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link.textContent).toContain(first.name)
    expect(link.textContent).toContain(first.desc)
    // No long descriptions on the Overview: they live on /apps.
    expect(section.textContent).not.toContain(first.longDesc)
    expect(within(section).getByRole("link", { name: "All apps" })).toHaveAttribute("href", "/apps")
  })
})
