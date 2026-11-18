import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react"

import type { TypedListRecord } from "@/lib/atproto/typed-lists"

const nav = { search: "kind=lists" }
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/records",
}))

vi.mock("@/hooks/use-url-param", () => ({
  useUrlParam: (key: string) => [new URLSearchParams(nav.search).get(key), vi.fn()],
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true, isLoading: false }),
}))

const typed = { lists: [] as TypedListRecord[] }
vi.mock("@/hooks/use-typed-lists", () => ({
  useTypedLists: (did: string | null) => {
    const lists = did ? typed.lists : []
    return {
      lists,
      byType: {
        "list:certs": lists.filter((l) => l.type === "list:certs"),
        "list:projects": lists.filter((l) => l.type === "list:projects"),
        "list:accounts": lists.filter((l) => l.type === "list:accounts"),
      },
      isLoading: false,
      error: null,
      createList: vi.fn(),
      updateList: vi.fn(),
      deleteList: vi.fn(),
      addItem: vi.fn(),
      addManyItems: vi.fn(),
      removeItem: vi.fn(),
      removeManyItems: vi.fn(),
    }
  },
}))

type EndorsementListStub = { uri: string; rkey: string; title: string; items: unknown[]; createdAt: string }
const endorsementLists = { lists: [] as EndorsementListStub[] }
const MENTORS: EndorsementListStub = { uri: "at://e/1", rkey: "1", title: "Mentors", items: [], createdAt: "2026-11-12T10:00:00Z" }
vi.mock("@/hooks/use-endorsement-lists", () => ({
  useEndorsementLists: () => ({
    lists: endorsementLists.lists,
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

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
  }
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  proto.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

import WorkspaceShell from "@/components/layout/workspace-shell"
import { ListsPane, defaultListTab } from "../records-panes"

const LIST: TypedListRecord = {
  uri: "at://did:plc:me/org.hypercerts.collection/l1",
  cid: "c",
  rkey: "l1",
  type: "list:certs",
  title: "Field work",
  createdAt: "2026-11-12T10:00:00Z",
  items: [],
} as unknown as TypedListRecord

function renderPane() {
  return render(
    <WorkspaceShell current="lists">
      <ListsPane did="did:plc:me" />
    </WorkspaceShell>,
  )
}

beforeEach(() => {
  nav.search = "kind=lists"
  typed.lists = []
  endorsementLists.lists = []
})

describe("Lists (X11, LI1, LI2)", () => {
  it("draws no title or line over the pane: the side list names it, the h1 is for screen readers", () => {
    renderPane()
    expect(screen.getByRole("heading", { level: 1, name: "Lists" })).not.toHaveClass("sr-only")
    expect(screen.queryByText(/Open a list to rename/)).toBeNull()
  })

  it("with no list: an empty state that carries New activity list, nothing on the tab line", () => {
    const { container } = renderPane()
    const tabbar = container.querySelector(".records-pane__tabbar") as HTMLElement
    expect(within(tabbar).queryByRole("button", { name: /New .* list/ })).toBeNull()
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByRole("heading", { name: "No activity lists yet" })).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole("button", { name: "New activity list" }))
    expect(screen.getByRole("dialog", { hidden: true, name: "Create activities list" })).toBeInTheDocument()
  })

  it("with lists: New activity list on the tab line, opening the same dialog", () => {
    typed.lists = [LIST]
    const { container } = renderPane()
    const tabbar = container.querySelector(".records-pane__tabbar") as HTMLElement
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).queryByRole("button", { name: "New activity list" })).toBeNull()
    expect(within(panel).getByRole("button", { name: /Field work/ })).toHaveClass("hover-tint", "hover-tint--bleed")
    fireEvent.click(within(tabbar).getByRole("button", { name: "New activity list" }))
    expect(screen.getByRole("dialog", { hidden: true, name: "Create activities list" })).toBeInTheDocument()
  })

  it("an open list carries the paste tip, and the tab line drops New list", () => {
    typed.lists = [LIST]
    nav.search = "kind=lists&list=l1"
    const { container } = renderPane()
    const tabbar = container.querySelector(".records-pane__tabbar") as HTMLElement
    expect(within(tabbar).queryByRole("button", { name: "New activity list" })).toBeNull()
    expect(
      screen.getByText("Add activities one at a time, or paste many links at once with Paste many."),
    ).toBeInTheDocument()
  })
})

// WS-05: the Overview's "1 List" opened Lists on an empty Activities tab.
describe("Lists: counts and the tab it opens on", () => {
  const PROJECT_LIST = { ...LIST, uri: "at://did:plc:me/org.hypercerts.collection/l2", rkey: "l2", type: "list:projects", title: "Funded" } as unknown as TypedListRecord

  it("gives each tab its count", () => {
    typed.lists = [LIST, PROJECT_LIST, { ...PROJECT_LIST, uri: "at://x/l3", rkey: "l3" } as unknown as TypedListRecord]
    endorsementLists.lists = [MENTORS]
    renderPane()
    const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) })
    expect(tab("Activities").textContent).toContain("1")
    expect(tab("Projects").textContent).toContain("2")
    expect(tab("Accounts").textContent).toContain("0")
    expect(tab("Endorsements").textContent).toContain("1")
  })

  it("with no tab in the URL, opens on the first tab that has lists", () => {
    typed.lists = [PROJECT_LIST]
    renderPane()
    expect(screen.getByRole("tab", { name: /^Projects/ })).toHaveAttribute("aria-selected", "true")
  })

  it("opens on Endorsements when only endorsement lists exist", () => {
    endorsementLists.lists = [MENTORS]
    renderPane()
    expect(screen.getByRole("tab", { name: /^Endorsements/ })).toHaveAttribute("aria-selected", "true")
  })

  it("keeps Activities with no lists at all, and a tab named in the URL", () => {
    renderPane()
    expect(screen.getByRole("tab", { name: /^Activities/ })).toHaveAttribute("aria-selected", "true")
    cleanup()
    typed.lists = [PROJECT_LIST]
    nav.search = "kind=lists&tab=activities"
    renderPane()
    expect(screen.getByRole("tab", { name: /^Activities/ })).toHaveAttribute("aria-selected", "true")
  })
})

describe("defaultListTab", () => {
  it("walks the tabs in order, stopping at one still loading", () => {
    expect(defaultListTab({ activities: 0, projects: 2, accounts: 1, endorsements: 0 })).toBe("projects")
    expect(defaultListTab({ activities: 0, projects: undefined, accounts: 1, endorsements: 0 })).toBe("projects")
    expect(defaultListTab({ activities: 0, projects: 0, accounts: 0, endorsements: 0 })).toBe("activities")
  })
})
