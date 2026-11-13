import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"

import type { EndorsementList } from "@/hooks/use-endorsement-lists"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("kind=endorsements&tab=lists"),
  usePathname: () => "/records",
}))

vi.mock("@/hooks/use-url-param", () => ({
  useUrlParam: () => ["lists", vi.fn()],
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true, isLoading: false }),
}))

vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: () => ({ endorsements: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock("@/hooks/use-own-response-states", () => ({
  useOwnResponseStates: () => ({
    resolve: () => ({ state: "unknown" }),
    responses: [],
    invalidate: vi.fn(),
    refetch: vi.fn(),
  }),
}))

const lists = { value: [] as EndorsementList[] }
vi.mock("@/hooks/use-endorsement-lists", () => ({
  useEndorsementLists: () => ({
    lists: lists.value,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    createList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    addSubjectToList: vi.fn(),
    addManySubjectsToList: vi.fn(),
    removeSubjectFromList: vi.fn(),
  }),
}))

import WorkspaceShell from "@/components/layout/workspace-shell"
import { EndorsementsPane } from "../records-panes"

const LIST: EndorsementList = {
  uri: "at://did:plc:me/org.hypercerts.collection/l1",
  cid: "c",
  rkey: "l1",
  title: "Partners",
  createdAt: "2026-11-12T10:00:00Z",
  items: [],
}

function renderPane() {
  return render(
    <WorkspaceShell current="endorsements">
      <EndorsementsPane
        did="did:plc:me"
        actor="me.certified.app"
        given={{ endorsements: [], isLoading: false, error: null, refetch: vi.fn() }}
      />
    </WorkspaceShell>,
  )
}

beforeEach(() => {
  lists.value = []
})

describe("Endorsements → Endorsement lists (EN4)", () => {
  it("puts the sort and New list on the tab line, not on a row of their own", () => {
    lists.value = [LIST]
    const { container } = renderPane()
    const tabbar = container.querySelector(".records-pane__tabbar") as HTMLElement
    expect(within(tabbar).getByRole("tablist", { name: "Endorsements" })).toBeInTheDocument()
    expect(within(tabbar).getByRole("button", { name: "Sort lists" })).toBeInTheDocument()
    expect(within(tabbar).getByRole("button", { name: "New list" })).toBeInTheDocument()
    // The panel holds only the rows.
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).queryByRole("button", { name: "New list" })).toBeNull()
    expect(panel.querySelector(".endorsement-lists__header")).toBeNull()
  })

  it("shows the lists as open rows (no card, no closing rule)", () => {
    lists.value = [LIST]
    renderPane()
    const row = screen.getByRole("button", { name: /Partners/ })
    expect(row).toHaveClass("endorsement-lists__row", "hover-tint", "hover-tint--bleed")
    expect(row.closest(".endorsement-lists__rows")).not.toBeNull()
  })

  it("with no list yet: no tab-line controls, the empty state carries New list", () => {
    renderPane()
    const tabbar = document.querySelector(".records-pane__tabbar") as HTMLElement
    expect(within(tabbar).queryByRole("button", { name: "New list" })).toBeNull()
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByRole("heading", { name: "No endorsement lists yet" })).toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "New list" })).toBeInTheDocument()
  })

  it("hides the tab-line controls while a list is open", () => {
    lists.value = [LIST]
    const { container } = renderPane()
    fireEvent.click(screen.getByRole("button", { name: /Partners/ }))
    const tabbar = container.querySelector(".records-pane__tabbar") as HTMLElement
    expect(within(tabbar).queryByRole("button", { name: "Sort lists" })).toBeNull()
    expect(screen.getByRole("button", { name: "Back to all lists" })).toBeInTheDocument()
  })
})
