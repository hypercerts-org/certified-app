import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// WS-11: "+ Endorse someone" only opens the panel; the panel's own Cancel
// is the one close control.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("kind=endorsements&tab=given"),
  usePathname: () => "/records",
}))

vi.mock("@/hooks/use-url-param", () => ({
  useUrlParam: () => ["given", vi.fn()],
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

vi.mock("@/hooks/use-endorsement-lists", () => ({
  useEndorsementLists: () => ({ lists: [], isLoading: false, error: null, refetch: vi.fn() }),
}))

// The panel itself (search, recipients, writes) is tested on its own; a
// stand-in with its search field and its Cancel.
vi.mock("@/components/endorsements/new-endorsement-panel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <section aria-label="Create endorsements">
      <input aria-label="Search by name or handle" />
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </section>
  ),
}))

import WorkspaceShell from "@/components/layout/workspace-shell"
import { EndorsementsPane } from "../records-panes"

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

describe("Endorse someone", () => {
  it("opens the panel on its search field, and pressing it again doesn't close it", () => {
    renderPane()
    const endorse = screen.getByRole("button", { name: "Endorse someone" })
    expect(endorse).not.toHaveAttribute("aria-expanded")

    fireEvent.click(endorse)
    const search = screen.getByRole("textbox", { name: "Search by name or handle" })
    expect(search).toHaveFocus()

    fireEvent.click(endorse)
    expect(screen.getByRole("region", { name: "Create endorsements" })).toBeInTheDocument()
    expect(search).toHaveFocus()
  })

  it("closes from the panel's Cancel, giving the focus back to the button", () => {
    renderPane()
    const endorse = screen.getByRole("button", { name: "Endorse someone" })
    fireEvent.click(endorse)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("region", { name: "Create endorsements" })).toBeNull()
    expect(endorse).toHaveFocus()
  })
})
