import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

let variant: "feedback" | "contact" = "feedback"
let session: { handle: string | null; email: string | null } = { handle: null, email: null }
let did: string | null = null

vi.mock("@/lib/feedback-context", () => ({
  useFeedback: () => ({ isOpen: true, variant, closeFeedback: vi.fn() }),
}))
vi.mock("@/hooks/use-session", () => ({ useSession: () => session }))
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ did }) }))
vi.mock("@/hooks/use-author-info", () => ({ useAuthorInfo: () => ({ info: null }) }))
// The dialog chrome is ResponsiveDialog's business; keep its props visible.
vi.mock("../responsive-dialog", () => ({
  default: ({
    open,
    ariaLabel,
    maxWidth,
    header,
    children,
  }: {
    open: boolean
    ariaLabel: string
    maxWidth?: number
    header?: ReactNode
    children: ReactNode
  }) =>
    open ? (
      <div role="dialog" aria-label={ariaLabel} data-max-width={maxWidth}>
        {header}
        {children}
      </div>
    ) : null,
}))

import FeedbackModal from "../feedback-modal"

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))

beforeEach(() => {
  variant = "feedback"
  session = { handle: null, email: null }
  did = null
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("FeedbackModal", () => {
  it("is called Send feedback, in sentence case, at the dialog width", () => {
    render(<FeedbackModal />)

    const dialog = screen.getByRole("dialog", { name: "Send feedback" })
    expect(dialog).toHaveAttribute("data-max-width", "420")
    expect(screen.getByRole("heading", { name: "Send feedback" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeInTheDocument()
  })

  it("uses sentence case for the contact variant too", () => {
    variant = "contact"
    render(<FeedbackModal />)

    expect(screen.getByRole("heading", { name: "Get in touch" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument()
  })

  it("asks a signed-out visitor for an optional email", () => {
    render(<FeedbackModal />)

    expect(screen.getByLabelText("Your email, if you'd like a reply (optional).")).toBeInTheDocument()
  })

  it("doesn't ask a signed-in account for its email, and replies to it", async () => {
    did = "did:plc:ada"
    session = { handle: "ada.certified.app", email: "ada@example.com" }
    render(<FeedbackModal />)

    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull()
    expect(screen.getByText("We'll reply to ada@example.com if we have questions.")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Lovely app" } })
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ message: "Lovely app", email: "ada@example.com", handle: "ada.certified.app" })
  })

  it("keeps the field for a signed-in account without an email", () => {
    did = "did:plc:bsky"
    session = { handle: "someone.bsky.social", email: null }
    render(<FeedbackModal />)

    expect(screen.getByLabelText("Your email, if you'd like a reply (optional).")).toBeInTheDocument()
  })

  it("sends signed-out feedback without an email", async () => {
    render(<FeedbackModal />)

    fireEvent.change(screen.getByRole("textbox", { name: /Tell us/ }), { target: { value: "Lovely app" } })
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it("needs an email for a signed-out contact request", async () => {
    variant = "contact"
    render(<FeedbackModal />)

    const email = screen.getByLabelText("Your email, so we can get back to you.")
    expect(email).toBeRequired()
    fireEvent.change(screen.getByRole("textbox", { name: /Tell us/ }), { target: { value: "Hello" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))

    expect(await screen.findByText("Enter your email so we can get back to you.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(email, { target: { value: "ada@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ email: "ada@example.com" })
  })
})
