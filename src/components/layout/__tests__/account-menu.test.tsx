import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within, act } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

// --- Module mocks ---------------------------------------------------------
// The menu reads who is signed in (auth, session, profile), who they act as
// (org context) and a few actions (feedback, theme, switching). Each is a
// hoisted latch so a test can set the account state before rendering.

const state = vi.hoisted(() => ({
  activeOrg: null as Group | null,
  groups: [] as Group[],
  selfGroup: null as Group | null,
  openSignIn: vi.fn(),
  signOut: vi.fn(),
  openFeedback: vi.fn(),
  switchActor: vi.fn(),
  setTheme: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    did: "did:plc:me",
    isAuthenticated: true,
    isLoading: false,
    openSignIn: state.openSignIn,
    signOut: state.signOut,
  }),
}))

vi.mock("@/lib/feedback-context", () => ({
  useFeedback: () => ({ openFeedback: state.openFeedback }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: state.activeOrg,
    groups: state.groups,
    selfGroup: state.selfGroup,
    switchOrg: vi.fn(),
  }),
}))

vi.mock("@/lib/groups/use-switch-actor", () => ({
  useSwitchActor: () => state.switchActor,
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: "maya.certified.app" }),
}))

vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: { displayName: "Maya Lin" }, avatarUrl: null }),
}))

vi.mock("@/hooks/use-org-profile", () => ({
  useOrgProfile: () => ({ orgAvatarUrl: null }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: state.setTheme }),
}))

import {
  AccountMenuContent,
  PhoneAccountMenu,
  identityTag,
} from "../account-menu"

const EARTH: Group = {
  groupDid: "did:plc:earth",
  handle: "earth.example",
  displayName: "Ma Earth",
  role: "admin",
  accepted: true,
}
const RIVER: Group = {
  groupDid: "did:plc:river",
  handle: "river.example",
  displayName: "River Trust",
  role: "owner",
  accepted: true,
}

function polyfillDialog() {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void
    close?: () => void
    __polyfilled?: boolean
  }
  if (proto.__polyfilled) return
  proto.__polyfilled = true
  proto.showModal = function () {
    ;(this as unknown as { open: boolean }).open = true
  }
  proto.close = function () {
    ;(this as unknown as { open: boolean }).open = false
    ;(this as unknown as HTMLDialogElement).dispatchEvent(new Event("close"))
  }
}

beforeEach(() => {
  polyfillDialog()
  state.activeOrg = null
  state.groups = [EARTH, RIVER]
  state.selfGroup = null
  state.openSignIn.mockReset()
  state.signOut.mockReset().mockResolvedValue(undefined)
  state.openFeedback.mockReset()
  state.switchActor.mockReset()
  state.setTheme.mockReset()
})

function renderMenu(mode: "menu" | "sheet" = "menu") {
  const onClose = vi.fn()
  const onRequestSignOut = vi.fn()
  const view = render(
    // The desktop popover hosts the content in a role="menu" container.
    <div role={mode === "menu" ? "menu" : undefined} aria-label="Account">
      <AccountMenuContent mode={mode} onClose={onClose} onRequestSignOut={onRequestSignOut} />
    </div>,
  )
  return { ...view, onClose, onRequestSignOut }
}

describe("identityTag", () => {
  it("names personal accounts, groups with the role, and group accounts", () => {
    expect(identityTag({ kind: "personal" })).toBe("Personal")
    expect(identityTag({ kind: "group", role: "admin" })).toBe("Group · Admin")
    expect(identityTag({ kind: "group-account", role: "owner" })).toBe("Group account")
  })
})

describe("AccountMenuContent", () => {
  it("lists the sections in order: profile, switch account, settings/help/feedback/appearance, session", () => {
    renderMenu("menu")
    const labels = [
      ...screen.getAllByRole("menuitem"),
      ...screen.getAllByRole("menuitemradio"),
    ]
      .sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map((el) => el.textContent?.trim())
    expect(labels).toEqual([
      "View profile",
      expect.stringContaining("Maya Lin"),
      expect.stringContaining("River Trust"),
      expect.stringContaining("Ma Earth"),
      "New group",
      "Settings",
      "Help",
      "Send feedback",
      "Light",
      "Dark",
      "System",
      expect.stringContaining("Sign in with another account"),
      "Sign out",
    ])
  })

  it("shows the current personal account with its tag and profile link", () => {
    renderMenu("menu")
    expect(screen.getAllByText("Maya Lin")[0]).toBeInTheDocument()
    expect(screen.getByText("Personal")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "View profile" })).toHaveAttribute(
      "href",
      "/maya.certified.app",
    )
  })

  it("checks the current account and shows each group's handle and role", () => {
    renderMenu("menu")
    const personal = screen.getByRole("menuitemradio", { name: /Maya Lin/ })
    const earth = screen.getByRole("menuitemradio", { name: /Ma Earth/ })
    expect(personal).toHaveAttribute("aria-checked", "true")
    expect(earth).toHaveAttribute("aria-checked", "false")
    expect(within(earth).getByText("@earth.example")).toBeInTheDocument()
    expect(within(earth).getByText("Admin")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Switch account" })).toBeInTheDocument()
  })

  it("switches to a group and closes the menu", () => {
    const { onClose } = renderMenu("menu")
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(onClose).toHaveBeenCalled()
    expect(state.switchActor).toHaveBeenCalledWith(EARTH)
  })

  it("does not switch when picking the current account", () => {
    const { onClose } = renderMenu("menu")
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Maya Lin/ }))
    expect(onClose).toHaveBeenCalled()
    expect(state.switchActor).not.toHaveBeenCalled()
  })

  it("shows the group, its role tag and who is acting while acting as a group", () => {
    state.activeOrg = EARTH
    renderMenu("menu")
    expect(screen.getByText("Group · Admin")).toBeInTheDocument()
    expect(screen.getByText("as @maya.certified.app")).toBeInTheDocument()
    expect(screen.getByRole("menuitemradio", { name: /Ma Earth/ })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.getByRole("menuitem", { name: "View profile" })).toHaveAttribute(
      "href",
      "/earth.example",
    )
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Maya Lin/ }))
    expect(state.switchActor).toHaveBeenCalledWith(null)
  })

  it("hides the switch section for an account that is itself a group", () => {
    state.selfGroup = { ...RIVER, groupDid: "did:plc:me" }
    state.groups = []
    renderMenu("menu")
    expect(screen.getByText("Group account")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Switch account" })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "New group" })).toBeNull()
  })

  it("opens feedback, signs in as someone else and asks before signing out", () => {
    const { onClose, onRequestSignOut } = renderMenu("menu")
    fireEvent.click(screen.getByRole("menuitem", { name: "Send feedback" }))
    expect(state.openFeedback).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("menuitem", { name: /Sign in with another account/ }))
    expect(state.openSignIn).toHaveBeenCalled()
    expect(screen.getByText("Signs you out of @maya.certified.app")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }))
    expect(onRequestSignOut).toHaveBeenCalled()
    expect(state.signOut).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it("sets the theme from the Appearance row", () => {
    renderMenu("menu")
    expect(screen.getByRole("group", { name: "Appearance" })).toBeInTheDocument()
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Light" }))
    expect(state.setTheme).toHaveBeenCalledWith("light")
  })

  it("keeps menu items out of the tab order (the popover roves with arrow keys)", () => {
    renderMenu("menu")
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("tabindex", "-1")
    }
  })

  it("renders plain, tabbable controls in sheet mode, with the legal links", () => {
    renderMenu("sheet")
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0)
    expect(screen.getByRole("heading", { level: 3, name: "Switch account" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Maya Lin/ })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true")
    const legal = screen.getByRole("navigation", { name: "Legal" })
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
  })
})

describe("PhoneAccountMenu", () => {
  it("opens a titled sheet with a close button, and confirms before signing out", async () => {
    render(<PhoneAccountMenu />)
    const trigger = screen.getByRole("button", { name: /Maya Lin, @maya\.certified\.app, account menu/ })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(trigger)

    const sheet = screen.getByRole("dialog", { name: "Account" })
    expect(within(sheet).getByRole("heading", { name: "Account" })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole("button", { name: "Sign out" }))
    const confirm = screen.getByRole("alertdialog", { hidden: true })
    expect(within(confirm).getByText("Sign out of Certified?")).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: "Sign out", hidden: true }))
    })
    expect(state.signOut).toHaveBeenCalledTimes(1)
  })
})
