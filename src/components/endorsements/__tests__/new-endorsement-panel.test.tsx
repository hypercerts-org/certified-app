import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null }),
}))

vi.mock("@/lib/atproto/badges", () => ({
  createEndorsementAward: vi.fn(async () => ({ uri: "at://x/a/1", cid: "c" })),
}))

import NewEndorsementPanel from "../new-endorsement-panel"
import { createEndorsementAward } from "@/lib/atproto/badges"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

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

// Workspace → Endorsements acting as a group: the group endorses, through
// the group route (`createEndorsementAward`'s `targetDid` path).
describe("NewEndorsementPanel acting as a group", () => {
  function renderGroupPanel(initialDids: string[]) {
    return render(
      <NewEndorsementPanel
        ownDid="did:plc:me"
        targetDid="did:plc:group"
        groupName="Estuary Alliance"
        existingSubjectDids={new Set()}
        initialDids={initialDids}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )
  }

  it("says the group endorses", () => {
    const { container } = renderGroupPanel([])
    expect(container.textContent).toContain("Estuary Alliance endorses them")
  })

  it("writes every award as the group", async () => {
    renderGroupPanel(["did:plc:a", "did:plc:b"])
    fireEvent.click(screen.getByRole("button", { name: "Endorse 2 accounts" }))
    await waitFor(() => expect(createEndorsementAward).toHaveBeenCalledTimes(2))
    expect(createEndorsementAward).toHaveBeenCalledWith("did:plc:me", "did:plc:a", undefined, {
      targetDid: "did:plc:group",
    })
    expect(createEndorsementAward).toHaveBeenCalledWith("did:plc:me", "did:plc:b", undefined, {
      targetDid: "did:plc:group",
    })
  })

  it("personal: writes as you, without a group", async () => {
    renderPanel(["did:plc:a"])
    fireEvent.click(screen.getByRole("button", { name: "Endorse" }))
    await waitFor(() => expect(createEndorsementAward).toHaveBeenCalledTimes(1))
    expect(createEndorsementAward).toHaveBeenCalledWith("did:plc:me", "did:plc:a")
  })
})
