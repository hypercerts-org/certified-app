import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"

// C5: the update form follows the one validation rule (the title's error
// on blur or on a click, then live; the button disabled only while
// saving; a click lists what's missing and focuses the title). C2: it
// asks before Cancel throws typed text away.

const push = vi.fn()
vi.mock("next/navigation", () => ({
  usePathname: () => "/x/activity/abc/update/new",
  useRouter: () => ({ push, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/leaflet/leaflet-editor-dynamic", () => ({
  default: () => <div data-testid="leaflet-editor" />,
}))

vi.mock("@/hooks/use-context-updates", () => ({
  invalidateContextUpdates: vi.fn(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me" }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null }),
}))

const writeContextUpdate = vi.fn()
vi.mock("@/lib/atproto/context-attachment", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/atproto/context-attachment")>()
  return { ...actual, writeContextUpdate: (...a: unknown[]) => writeContextUpdate(...a) }
})

import UpdateForm from "../update-form"
import { ViewTransitionProvider } from "@/lib/view-transitions"

const props = {
  ownDid: "did:plc:me",
  targetDid: "did:plc:me",
  subjectUri: "at://did:plc:me/org.hypercerts.claim.activity/abc",
  subjectCid: "bafysubject",
  backHref: "/back",
  mode: "create" as const,
}

beforeEach(() => {
  push.mockReset()
  writeContextUpdate.mockReset()
})

describe("UpdateForm validation", () => {
  it("keeps Post update enabled and explains a click without a title", () => {
    render(<UpdateForm {...props} />)
    const post = screen.getByRole("button", { name: "Post update" })
    expect(post).not.toBeDisabled()
    fireEvent.click(post)
    expect(screen.getByText("Before posting: add a title.")).toBeInTheDocument()
    const title = screen.getByLabelText("Title")
    expect(document.activeElement).toBe(title)
    expect(title).toHaveAttribute("aria-invalid", "true")
    expect(writeContextUpdate).not.toHaveBeenCalled()
  })

  it("shows the title's error once left empty, and clears it as it's typed", () => {
    render(<UpdateForm {...props} />)
    const title = screen.getByLabelText("Title")
    expect(screen.queryByText("Add a title.")).toBeNull()
    fireEvent.blur(title)
    expect(screen.getByText("Add a title.")).toBeInTheDocument()
    fireEvent.change(title, { target: { value: "Planting done" } })
    expect(screen.queryByText("Add a title.")).toBeNull()
  })

  it("marks the optional fields in their labels", () => {
    render(<UpdateForm {...props} />)
    expect(screen.getByLabelText("Short description (optional)")).toBeInTheDocument()
    expect(screen.getByText("Attachments (optional)")).toBeInTheDocument()
  })
})

describe("UpdateForm unsaved changes", () => {
  it("leaves at once when nothing was typed", () => {
    render(
      <ViewTransitionProvider>
        <UpdateForm {...props} />
      </ViewTransitionProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(push).toHaveBeenCalledWith("/back")
  })

  it("asks before Cancel discards typed text", () => {
    render(
      <ViewTransitionProvider>
        <UpdateForm {...props} />
      </ViewTransitionProvider>,
    )
    const title = screen.getByLabelText("Title")
    act(() => {
      fireEvent.input(title, { target: { value: "Half written" } })
      fireEvent.change(title, { target: { value: "Half written" } })
    })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog", { hidden: true })).toHaveTextContent(
      "Discard your changes?",
    )
    fireEvent.click(screen.getByRole("button", { name: "Discard changes", hidden: true }))
    expect(push).toHaveBeenCalledWith("/back")
  })
})
