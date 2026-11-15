import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

// The activity page as a signed-out visitor sees it: which tabs show, the
// eyebrow's project, the work scope as tags.

vi.mock("next/navigation", () => ({
  usePathname: () => "/alice.test/activity/act1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
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

vi.mock("@/hooks/use-contributor-info", () => ({
  isAtprotoIdentity: (v: string) => typeof v === "string" && v.startsWith("did:"),
  useContributorInfo: () => ({ info: null, isLoading: false, isAtproto: false }),
}))

vi.mock("@/hooks/use-record-funding", () => ({
  useRecordFunding: () => ({
    receipts: [],
    isLoading: false,
    error: null,
    complete: true,
    refetch: () => {},
  }),
}))

vi.mock("@/hooks/use-context-updates", () => ({
  useContextUpdates: () => ({
    updates: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    removeUpdate: vi.fn(),
  }),
}))

vi.mock("@/components/context/context-updates", () => ({ default: () => null }))

let projects: { uri: string; cid: string; value: { title: string } }[] = []
vi.mock("@/hooks/use-cert-projects", () => ({
  useCertProjects: () => ({ projects, isLoading: false, error: null }),
}))

import ActivityDetail from "../activity-detail"
import type { ClaimActivity } from "@/lib/atproto/activity-types"

const DID = "did:plc:org"

function renderActivity(over: Partial<ClaimActivity> = {}) {
  const value = {
    title: "Mangrove nursery",
    shortDescription: "We grow mangroves.",
    createdAt: "2026-06-01T00:00:00Z",
    workScope: { expression: 'scope.hasAny(["forest_protection", "tree-nursery"])' },
    ...over,
  } as ClaimActivity
  return render(<ActivityDetail did={DID} value={value} cid="bafy" handle={null} />)
}

beforeEach(() => {
  projects = []
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ActivityDetail as a visitor", () => {
  it("shows no tab strip when only Overview has anything", () => {
    renderActivity({ contributors: [{ contributorIdentity: { identity: DID } }] })
    expect(screen.queryByRole("tablist")).toBeNull()
  })

  it("shows Contributors when someone besides the account took part", () => {
    renderActivity({
      contributors: [
        { contributorIdentity: { identity: DID } },
        { contributorIdentity: { identity: "Ana Lima" } },
      ],
    })
    const names = screen.getAllByRole("tab").map((t) => t.textContent?.trim())
    expect(names).toEqual(["Overview", "Contributors 2"])
    // A written name gets its initials and is spelled out under the row.
    expect(screen.getAllByText("Ana Lima").length).toBeGreaterThan(0)
    expect(screen.getByText("AL")).toBeTruthy()
  })

  it("reads the work scope as tags", () => {
    renderActivity()
    expect(screen.getByText("Forest protection")).toBeTruthy()
    expect(screen.getByText("Tree nursery")).toBeTruthy()
    expect(screen.queryByText(/hasAny/)).toBeNull()
  })

  it("names its project in the eyebrow, unless it has the activity's own title", () => {
    projects = [
      {
        uri: "at://did:plc:org/org.hypercerts.collection/p1",
        cid: "c",
        value: { title: "Coastal restoration" },
      },
    ]
    const { unmount } = renderActivity()
    const eyebrow = document.querySelector(".record-head__kind")
    expect(eyebrow?.textContent).toBe("Activity · Part of Coastal restoration")
    // In the eyebrow and in the rail's "Project" card.
    expect(screen.getAllByRole("link", { name: "Coastal restoration" })).toHaveLength(2)
    unmount()

    projects = [
      { uri: "at://did:plc:org/org.hypercerts.collection/p1", cid: "c", value: { title: "Mangrove Nursery" } },
    ]
    renderActivity()
    expect(document.querySelector(".record-head__kind")?.textContent).toBe("Activity")
    // The rail's Project card leads to it without repeating the title, and
    // says what it is instead.
    expect(screen.getByRole("heading", { name: "Project" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Mangrove Nursery" })).toBeNull()
    expect(screen.getByText(/A project of the same name gathers its funding/)).toBeTruthy()
    expect(screen.getByRole("link", { name: /Open the project/ }).getAttribute("href")).toBe(
      "/did:plc:org/project/p1",
    )
  })

  it("puts the details in the main column when there is no description", () => {
    renderActivity()
    const main = document.querySelector(".record-layout__main")!
    expect(main.textContent).toContain("Work scope")
    expect(main.textContent).toContain("Forest protection")
  })

  it("lists contributors without the board", () => {
    renderActivity({
      contributors: [
        { contributorIdentity: { identity: DID } },
        { contributorIdentity: { identity: "Ana Lima" } },
      ],
    })
    expect(screen.queryByText(/Contributor board/i)).toBeNull()
  })
})
