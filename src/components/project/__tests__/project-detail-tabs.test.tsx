import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// The project page's tab strip and Overview, read-only (not owner). The
// search params are mutable per test so a deep link can be simulated.

let search = ""

vi.mock("next/navigation", () => ({
  usePathname: () => "/alice.test/project/proj1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: [], switchOrg: () => {} }),
}))

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: true }),
}))

vi.mock("@/hooks/use-project-items", () => ({
  useProjectItems: () => ({ resolutions: [], isLoading: false }),
}))

// Two updates: the Updates tab counts them. The updates sections themselves
// are stubbed (their cards aren't under test).
vi.mock("@/hooks/use-context-updates", () => ({
  useContextUpdates: () => ({
    updates: [{ uri: "at://u/1" }, { uri: "at://u/2" }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    removeUpdate: vi.fn(),
  }),
}))

vi.mock("@/components/context/context-updates", () => ({
  default: () => null,
}))

import ProjectDetail from "../project-detail"
import type { CollectionValue } from "@/lib/atproto/collection"

const DID = "did:plc:abc"
const DESCRIPTION = "The full story of this project, at length."

const value = {
  title: "My project",
  shortDescription: "A short summary.",
  description: DESCRIPTION,
  items: [
    { uri: "at://did:plc:abc/org.hypercerts.claim.activity/a1", cid: "c1" },
    { uri: "at://did:plc:abc/org.hypercerts.claim.activity/a2", cid: "c2" },
    { uri: "at://did:plc:abc/org.hypercerts.claim.activity/a3", cid: "c3" },
  ],
} as unknown as CollectionValue

function renderProject() {
  return render(
    <ProjectDetail did={DID} rkey="proj1" value={value} cid="bafycid" handle={null} />,
  )
}

beforeEach(() => {
  cleanup()
  search = ""
})

afterEach(() => {
  cleanup()
})

describe("ProjectDetail tabs", () => {
  it("has no Description tab, and counts every list tab (not Overview)", () => {
    renderProject()
    const names = screen.getAllByRole("tab").map((t) => t.textContent?.trim())
    expect(names).toEqual(["Overview", "Activities 3", "Updates 2"])
  })

  it("keeps the description on Overview, behind Read full description", () => {
    renderProject()
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.getByText("A short summary.")).toBeTruthy()
    expect(screen.queryByText(DESCRIPTION)).toBeNull()

    const toggle = screen.getByRole("button", { name: "Read full description" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)

    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Description" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Hide description" }).getAttribute("aria-expanded"),
    ).toBe("true")
  })

  it("opens an old ?tab=description link on Overview with the description showing", () => {
    search = "tab=description"
    renderProject()

    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.queryByRole("tab", { name: /Description/ })).toBeNull()
    expect(screen.getByText("A short summary.")).toBeTruthy()
    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Hide description" }).getAttribute("aria-expanded"),
    ).toBe("true")
  })
})
