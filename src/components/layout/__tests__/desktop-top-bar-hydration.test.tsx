import type { PropsWithChildren } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const state = vi.hoisted(() => ({ pathname: "/dev/preview/feed" }))

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    did: "did:plc:viewer",
    openSignIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))
vi.mock("@/lib/navbar-context", () => ({
  useNavbarValues: () => ({
    pageTitle: null,
    desktopTitle: null,
    breadcrumb: null,
    profileAboutAvailable: false,
    profileGroupsAvailable: false,
    profileEditing: false,
  }),
}))
vi.mock("@/lib/view-transitions", () => ({
  useViewTransition: () => ({ transitionBack: vi.fn() }),
}))
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => ({ profile: null, avatarUrl: null }),
}))
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ handle: null }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: null,
    groups: [],
    selfGroup: null,
    switchOrg: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-org-profile", () => ({
  useOrgProfile: () => ({ orgAvatarUrl: null }),
}))
vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => false }))

// The regression assertion returns before chrome children mount. Keep those
// children inert so a failure reports the hydration gate itself rather than a
// missing provider from an unrelated primitive.
vi.mock("../site-drawer", () => ({ default: () => null }))
vi.mock("../account-switcher-list", () => ({ default: () => null }))
vi.mock("@/components/search/global-search", () => ({ default: () => null }))
vi.mock("@/components/ui/avatar", () => ({ default: () => null }))
vi.mock("@/components/ui/button", () => ({
  default: ({ children }: PropsWithChildren) => <button>{children}</button>,
}))
vi.mock("@/components/ui/brandmark", () => ({ default: () => null }))
vi.mock("@/components/ui/tooltip", () => ({
  default: ({ children }: PropsWithChildren) => <>{children}</>,
}))
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: PropsWithChildren) => <>{children}</>,
  PopoverTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
  PopoverContent: ({ children }: PropsWithChildren) => <>{children}</>,
}))
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: PropsWithChildren) => <>{children}</>,
  TabList: ({ children }: PropsWithChildren) => <>{children}</>,
  Tab: ({ children }: PropsWithChildren) => <>{children}</>,
}))

import DesktopTopBar from "../desktop-top-bar"

beforeEach(() => {
  state.pathname = "/dev/preview/feed"
})

afterEach(() => {
  cleanup()
})

describe("DesktopTopBar hydration gate", () => {
  it("keeps the server-sized placeholder when auth resolves before hydration", () => {
    const { container } = render(<DesktopTopBar />)

    expect(
      container.querySelector(
        ".desktop-top-bar.desktop-top-bar--placeholder[aria-hidden=\"true\"]",
      ),
    ).not.toBeNull()
    expect(container.querySelector("header[aria-label=\"App chrome\"]")).toBeNull()
  })

  it("does not reserve app-chrome space on editorial routes", () => {
    state.pathname = "/welcome"

    const { container } = render(<DesktopTopBar />)

    expect(container.innerHTML).toBe("")
  })
})
