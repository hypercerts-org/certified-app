import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"

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

vi.mock("@/hooks/use-endorsement-lists", () => ({
  useEndorsementLists: () => ({
    lists: [],
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
import { ListsPane } from "../records-panes"

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
})

describe("Lists (X11, LI1, LI2)", () => {
  it("says in one line what opening a list does", () => {
    renderPane()
    expect(
      screen.getByText(
        "Your lists of activities, projects, accounts and endorsements. Open a list to rename, delete or add to it.",
      ),
    ).toBeInTheDocument()
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
    expect(within(panel).getByRole("button", { name: /Field work/ })).toBeInTheDocument()
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
