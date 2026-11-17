import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null }),
}))

vi.mock("@/lib/atproto/badges", () => ({
  createEndorsementAward: vi.fn(),
}))

import NewEndorsementPanel from "../new-endorsement-panel"

afterEach(() => cleanup())

function renderPanel(initialDids?: string[]) {
  return render(
    <NewEndorsementPanel
      ownDid="did:plc:me"
      existingSubjectDids={new Set()}
      initialDids={initialDids}
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />,
  )
}

describe("NewEndorsementPanel (W12)", () => {
  it("asks for a name or handle, not a DID", () => {
    const { container } = renderPanel()
    expect(container.textContent).toContain("Search for an account by name or handle.")
    expect(container.textContent).not.toMatch(/DID/)
  })

  it("uses the standard boxed field for its search, not the underline", () => {
    renderPanel()
    const field = screen.getByRole("combobox")
    expect(field.className).not.toContain("border-b")
    expect(field.className).toContain("rounded")
  })

  it("counts accounts on its submit button", () => {
    renderPanel(["did:plc:a", "did:plc:b", "did:plc:c"])
    expect(screen.getByRole("button", { name: "Endorse 3 accounts" })).toBeInTheDocument()
  })
})
