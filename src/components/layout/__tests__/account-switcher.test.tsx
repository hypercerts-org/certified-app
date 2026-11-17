import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within, act, cleanup } from "@testing-library/react"
import type { Group } from "@/lib/groups/types"

// Who is signed in (auth, session, profile), who they act as (org context)
// and where they are (pathname, router). Hoisted latches so each test can
// set the state before rendering.
const state = vi.hoisted(() => ({
  pathname: "/feed",
  activeOrg: null as Group | null,
  groups: [] as Group[],
  selfGroup: null as Group | null,
  isFullDesktop: true,
  switchOrg: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  openSignInAnotherAccount: vi.fn(),
  signOut: vi.fn(),
  openFeedback: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    did: "did:plc:me",
    isAuthenticated: true,
    isLoading: false,
    openSignInAnotherAccount: state.openSignInAnotherAccount,
    signOut: state.signOut,
  }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: state.activeOrg,
    groups: state.groups,
    selfGroup: state.selfGroup,
    switchOrg: state.switchOrg,
  }),
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

vi.mock("@/hooks/use-layout-breakpoints", () => ({
  useLayoutBreakpoints: () => ({ isDesktop: true, isFullDesktop: state.isFullDesktop }),
}))

vi.mock("@/lib/feedback-context", () => ({
  useFeedback: () => ({ openFeedback: state.openFeedback }),
}))

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: state.toast, dismiss: vi.fn() }),
}))

import { identityTag } from "../account-menu"
import {
  AccountMenuContent,
  DesktopAccountSwitcher,
  PhoneAccountSwitcher,
} from "../account-switcher"

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
  state.pathname = "/feed"
  state.activeOrg = null
  state.groups = [EARTH, RIVER]
  state.selfGroup = null
  state.isFullDesktop = true
  for (const fn of [
    state.switchOrg,
    state.push,
    state.toast,
    state.openSignInAnotherAccount,
    state.signOut,
    state.openFeedback,
  ]) {
    fn.mockReset()
  }
})

function renderMenu(mode: "menu" | "sheet" = "menu") {
  const onClose = vi.fn()
  const onRequestSignOut = vi.fn()
  render(
    <div role={mode === "menu" ? "menu" : undefined}>
      <AccountMenuContent mode={mode} onClose={onClose} onRequestSignOut={onRequestSignOut} />
    </div>,
  )
  return { onClose, onRequestSignOut }
}

describe("identityTag", () => {
  it("names personal accounts, groups with the role, and group accounts", () => {
    expect(identityTag({ kind: "personal" })).toBe("Personal")
    expect(identityTag({ kind: "group", role: "admin" })).toBe("Group · Admin")
    expect(identityTag({ kind: "group" })).toBe("Group")
    expect(identityTag({ kind: "group-account" })).toBe("Group account")
  })
})

describe("AccountMenuContent", () => {
  it("with nothing to switch, is you, then your profile, settings and the session", () => {
    state.groups = []
    renderMenu()
    expect(screen.queryByText("Act as")).not.toBeInTheDocument()
    expect(screen.getByText("Maya Lin")).toBeInTheDocument()
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual([
      "View profile",
      "Settings",
      expect.stringContaining("Sign in with another account"),
      "Send feedback",
      "Sign out",
    ])
  })

  it("lists you first, then your groups, under Act as, the current one checked", () => {
    renderMenu()
    const act = screen.getByRole("group", { name: "Act as" })
    const rows = within(act).getAllByRole("menuitemradio")
    // You first; then the groups as the switcher sorts them (owner first).
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Maya Lin"),
      expect.stringContaining("River Trust"),
      expect.stringContaining("Ma Earth"),
    ])
    // The note (or a group's role) first, so a long @handle is what truncates.
    expect(rows[0]).toHaveTextContent("You · @maya.certified.app")
    expect(rows[1]).toHaveTextContent("Owner · @river.example")
    expect(rows[0]).toHaveAttribute("aria-checked", "true")
    expect(within(act).getByRole("menuitem", { name: /New group/ })).toHaveAttribute(
      "href",
      "/groups/create",
    )
  })

  it("is signed in as you, whichever group you act as", () => {
    state.activeOrg = EARTH
    renderMenu()
    expect(screen.getByRole("menuitemradio", { name: /Ma Earth/ })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.getByRole("group", { name: "Signed in as Maya Lin" })).toBeInTheDocument()
  })

  it("puts a settings gear on every account, yours too, apart from the row that switches", () => {
    renderMenu()
    expect(screen.getByRole("menuitem", { name: "Your settings" })).toHaveAttribute("href", "/settings")
    expect(screen.getByRole("menuitem", { name: "Ma Earth settings" })).toHaveAttribute(
      "href",
      expect.stringContaining("/groups/"),
    )
    // So no separate Settings row under "Signed in as".
    expect(screen.queryByRole("menuitem", { name: "Settings" })).toBeNull()
  })

  it("a gear acts as that account as it opens its settings; yours, while you are you, just opens them", () => {
    renderMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Your settings" }))
    expect(state.switchOrg).not.toHaveBeenCalled()
    cleanup()
    renderMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Ma Earth settings" }))
    expect(state.switchOrg).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Ma Earth" }))
  })

  it("switches in place: on the Feed it stays on the Feed, and says so", () => {
    const { onClose } = renderMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(onClose).toHaveBeenCalled()
    expect(state.switchOrg).toHaveBeenCalledWith(EARTH)
    expect(state.push).not.toHaveBeenCalled()
    expect(state.toast).toHaveBeenCalledWith({ title: "Now acting as Ma Earth" })
  })

  it("picking the account you already act as just closes the menu", () => {
    renderMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Maya Lin/ }))
    expect(state.switchOrg).not.toHaveBeenCalled()
    expect(state.push).not.toHaveBeenCalled()
    expect(state.toast).not.toHaveBeenCalled()
  })

  it("leaves a personal-only page for the Overview when switching to a group", () => {
    state.pathname = "/groups"
    renderMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(state.push).toHaveBeenCalledWith("/home")
  })

  it("on a settings page, opens the new account's settings", () => {
    state.pathname = "/groups/did:plc:river/settings"
    renderMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ma Earth/ }))
    expect(state.push).toHaveBeenCalledWith(expect.stringMatching(/^\/groups\/[^/]+\/settings$/))
  })

  it("inside the Workspace, stays on the section when it works for the new account", () => {
    state.pathname = "/records"
    state.activeOrg = EARTH
    renderMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Maya Lin/ }))
    expect(state.switchOrg).toHaveBeenCalledWith(null)
    expect(state.push).not.toHaveBeenCalled()
    expect(state.toast).toHaveBeenCalledWith({ title: "Now acting as Maya Lin" })
  })

  it("picking a group on a Records section stays on it (the section explains itself)", () => {
    state.pathname = "/records"
    renderMenu()
    fireEvent.click(screen.getByRole("menuitemradio", { name: /River Trust/ }))
    expect(state.switchOrg).toHaveBeenCalledWith(RIVER)
    expect(state.push).not.toHaveBeenCalled()
  })

  it("on a form, keeps the accounts in view but doesn't switch, so the draft stays", () => {
    state.pathname = "/create"
    renderMenu()
    const row = screen.getByRole("menuitemradio", { name: /Ma Earth/ })
    expect(row).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Finish or cancel this form to switch.")).toBeInTheDocument()
    fireEvent.click(row)
    expect(state.switchOrg).not.toHaveBeenCalled()
    expect(state.push).not.toHaveBeenCalled()
  })

  it("tags an account that is itself a group, with nothing to switch", () => {
    state.selfGroup = EARTH
    renderMenu()
    expect(screen.queryByText("Act as")).not.toBeInTheDocument()
    expect(screen.getByText("Group account")).toBeInTheDocument()
  })

  it("signs in as someone else, and asks before signing out", () => {
    const { onRequestSignOut } = renderMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign in with another account/ }))
    expect(state.openSignInAnotherAccount).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }))
    expect(onRequestSignOut).toHaveBeenCalled()
  })

  it("keeps menu items out of the tab order (the popover roves with arrow keys)", () => {
    renderMenu("menu")
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("tabindex", "-1")
    }
  })

  it("renders plain, tabbable controls in sheet mode", () => {
    renderMenu("sheet")
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View profile" })).not.toHaveAttribute("tabindex")
    expect(screen.getByRole("heading", { name: "Act as" })).toBeInTheDocument()
  })

  it("on phones (the sheet) also holds Help, feedback and the legal links", () => {
    renderMenu("sheet")
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help")
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))
    expect(state.openFeedback).toHaveBeenCalled()
    expect(screen.getByRole("navigation", { name: "Legal" })).toHaveTextContent("Terms")
  })

  it("leaves Help and the legal links to the sidebar and footer on desktop (the menu)", () => {
    renderMenu("menu")
    expect(screen.queryByRole("link", { name: "Help" })).toBeNull()
    expect(screen.queryByRole("navigation", { name: "Legal" })).toBeNull()
  })

  it("on desktop (the menu), offers Send feedback last before Sign out", () => {
    const { onClose } = renderMenu("menu")
    const you = screen.getByRole("group", { name: /Signed in as/ })
    const items = within(you).getAllByRole("menuitem").map((el) => el.textContent)
    expect(items.slice(-2)).toEqual(["Send feedback", "Sign out"])
    fireEvent.click(within(you).getByRole("menuitem", { name: "Send feedback" }))
    expect(onClose).toHaveBeenCalled()
    expect(state.openFeedback).toHaveBeenCalled()
  })

  it("on phones (the sheet), keeps a single Send feedback, in the Help block", () => {
    renderMenu("sheet")
    expect(screen.getAllByRole("button", { name: "Send feedback" })).toHaveLength(1)
  })
})

describe("DesktopAccountSwitcher", () => {
  it("names you, with your handle, when you act as yourself", () => {
    render(<DesktopAccountSwitcher />)
    const trigger = screen.getByRole("button", {
      name: "Maya Lin, @maya.certified.app, account menu",
    })
    expect(trigger).toHaveTextContent("Maya Lin")
    expect(trigger.querySelector(".acting-avatar__you")).toBeNull()
  })

  it("shows the group, with you on its corner, while acting as it", () => {
    state.activeOrg = EARTH
    render(<DesktopAccountSwitcher />)
    const trigger = screen.getByRole("button", {
      name: "Ma Earth, group, signed in as Maya Lin, account menu",
    })
    expect(trigger).toHaveTextContent("Group · Admin")
    expect(trigger.querySelector(".acting-avatar__you")).not.toBeNull()
  })

  it("on the rail (hover-capable), keeps the same button through its menu, so Escape returns focus to it", () => {
    state.isFullDesktop = false
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    )
    render(<DesktopAccountSwitcher />)
    const trigger = screen.getByRole("button", { name: /account menu/ })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu", { name: "Account" })).toBeNull()
    // The very same element, still in the document, holds focus.
    expect(trigger.isConnected).toBe(true)
    expect(document.activeElement).toBe(trigger)
    vi.unstubAllGlobals()
  })

  it("opens the account menu and asks before signing out", () => {
    render(<DesktopAccountSwitcher />)
    fireEvent.click(screen.getByRole("button", { name: /account menu/ }))
    const menu = screen.getByRole("menu", { name: "Account" })
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Sign out" }))
    expect(screen.getByText("Sign out of Certified?")).toBeInTheDocument()
  })
})

describe("PhoneAccountSwitcher", () => {
  it("opens the same menu as a titled sheet", async () => {
    state.activeOrg = EARTH
    render(<PhoneAccountSwitcher />)
    const trigger = screen.getByRole("button", { name: /Ma Earth, group/ })
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog")
    await act(async () => {
      fireEvent.click(trigger)
    })
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Signed in as Maya Lin" })).toBeInTheDocument()
  })
})
