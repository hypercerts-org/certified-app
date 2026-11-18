import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react"

/**
 * The record and profile "More actions" menu: a popover menu from 800px,
 * a sheet titled with the record's or account's name below it (as the
 * Records rows' menu), Delete last in red, and copies that keep the menu
 * open to say "Copied".
 */

const breakpoints = { isDesktop: false }
vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({
    isDesktop: breakpoints.isDesktop,
    hasRightRail: breakpoints.isDesktop,
    isFullDesktop: false,
    isStandalone: false,
  }),
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
let viewerDid: string | null = "did:plc:me"
const openSignIn = vi.fn()
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: viewerDid, openSignIn }),
}))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ activeOrg: null }) }))
const copy = vi.fn()
let copied = false
vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copied, copy }),
}))
const createList = vi.fn()
vi.mock("@/hooks/use-typed-lists", () => ({
  useTypedLists: () => ({
    byType: { "list:certs": [], "list:projects": [], "list:accounts": [] },
    isLoading: false,
    createList,
    addItem: vi.fn(),
  }),
}))

import AddToListMenu from "../add-to-list-menu"
import ProfileMoreMenu from "@/components/profile/profile-more-menu"

const URI = "at://did:plc:owner/org.hypercerts.claim.activity/abc"
const onDelete = vi.fn()

function recordMenu() {
  return render(
    <AddToListMenu
      targetUri={URI}
      targetCid="bafy"
      targetType="list:certs"
      showShare={false}
      trigger="header"
      title="River survey"
      editActions={{
        isCreator: true,
        editHref: "/me/activity/abc/edit",
        editAsGroupLabel: null,
        onEditAsGroup: vi.fn(),
        onDelete,
      }}
    />,
  )
}

beforeEach(() => {
  breakpoints.isDesktop = false
  viewerDid = "did:plc:me"
  copied = false
  push.mockReset()
  copy.mockReset()
  onDelete.mockReset()
  openSignIn.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("a record's More actions on a phone", () => {
  it("opens a sheet titled with the record, Delete last after a separator", () => {
    recordMenu()
    const trigger = screen.getByRole("button", { name: "More actions" })
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
    fireEvent.click(trigger)
    const sheet = screen.getByRole("dialog", { name: "River survey" })
    const rows = within(sheet)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => t !== "")
    expect(rows).toEqual(["Edit", "Add to list", "Copy Permanent ID", "Delete"])
    const del = within(sheet).getByRole("button", { name: "Delete" })
    expect(del.previousElementSibling?.tagName).toBe("HR")
    expect(del.className).toContain("text-[var(--color-error)]")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("closes the sheet and runs the entry", () => {
    recordMenu()
    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(onDelete).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "More actions" }).getAttribute("aria-expanded")).toBe(
      "false",
    )
  })

  it("keeps the sheet open after a copy, so it can say Copied", () => {
    recordMenu()
    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy Permanent ID" }))
    expect(copy).toHaveBeenCalledWith(URI)
    expect(screen.getByRole("dialog", { name: "River survey" })).toBeTruthy()
  })
})

describe("a record's More actions from 800px", () => {
  it("is a popover menu with the same entries", () => {
    breakpoints.isDesktop = true
    recordMenu()
    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    const menu = screen.getByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "Edit",
      "Add to list",
      "Copy Permanent ID",
      "Delete",
    ])
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("the Add to list dialog", () => {
  it("says a failed write in a sentence, not the upstream error", async () => {
    createList.mockRejectedValue(new Error("XRPC 502 from the PDS"))
    recordMenu()
    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(screen.getByRole("button", { name: "Add to list" }))
    // jsdom keeps <dialog> closed, so its contents count as hidden.
    fireEvent.click(screen.getByRole("button", { name: "Create a new list", hidden: true }))
    fireEvent.change(screen.getByRole("textbox", { name: "New list name", hidden: true }), {
      target: { value: "Coasts" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create & add", hidden: true }))
    await waitFor(() =>
      expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(
        "Couldn't create the list. Try again in a moment.",
      ),
    )
  })
})

describe("a profile's More actions on a phone", () => {
  it("opens a sheet titled with the account's name", () => {
    render(
      <ProfileMoreMenu
        did="did:plc:ada"
        name="Ada Pollen"
        handle="ada.test"
        onBluesky
        settingsHref="/groups/did:plc:ada/settings"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    const sheet = screen.getByRole("dialog", { name: "Ada Pollen" })
    expect(within(sheet).getByRole("button", { name: "Add to list" })).toBeTruthy()
    expect(within(sheet).getByRole("button", { name: "Copy Permanent ID" })).toBeTruthy()
    expect(within(sheet).getByRole("button", { name: "Open on Bluesky" })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole("button", { name: "Group settings" }))
    expect(push).toHaveBeenCalledWith("/groups/did:plc:ada/settings")
  })

  it("asks a visitor to sign in before adding to a list", () => {
    viewerDid = null
    render(<ProfileMoreMenu did="did:plc:ada" name="Ada Pollen" handle="ada.test" onBluesky={false} />)
    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(screen.getByRole("button", { name: "Add to list" }))
    expect(openSignIn).toHaveBeenCalled()
  })
})
