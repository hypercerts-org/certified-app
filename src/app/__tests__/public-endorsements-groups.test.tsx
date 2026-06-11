import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

/**
 * P1: /endorsements and /groups used to redirect anonymous (signed-out)
 * visitors to /welcome via the route-level <AuthGuard>. That guard was
 * removed; instead each page renders a public sign-in prompt in place.
 *
 * Both pages are personal, owner-scoped surfaces (a personal inbox and
 * the viewer's own membership list, keyed on the viewer's DID), so there
 * is no public listing to show — the "best available public view" is an
 * explanation + a sign-in CTA. These tests pin that:
 *   - signed-out renders the prompt (no crash, no error state),
 *   - the CTA invokes the shared openSignIn() flow,
 *   - signed-in still renders the real management UI.
 *
 * The shared SignedOutPrompt lets us assert one openSignIn() spy across
 * both routes.
 */

const openSignIn = vi.fn().mockResolvedValue(undefined)
const replace = vi.fn()

let authState: {
  did: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ ...authState, openSignIn }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

// --- /groups dependencies -------------------------------------------------
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({
    activeOrg: null,
    groups: [],
    isLoading: false,
    switchOrg: vi.fn(),
    refetchOrgs: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock("@/lib/groups/api", () => ({
  putMembership: vi.fn().mockResolvedValue(undefined),
  deleteMembership: vi.fn().mockResolvedValue(undefined),
  removeOrgMember: vi.fn().mockResolvedValue(undefined),
}))

// --- /endorsements dependencies ------------------------------------------
vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => ({
    endorsements: [],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: () => ({
    endorsements: [],
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/hooks/use-own-response-states", () => ({
  useOwnResponseStates: () => ({
    resolve: () => ({ state: null }),
    invalidate: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}))

beforeEach(() => {
  cleanup()
  openSignIn.mockClear()
  replace.mockClear()
  authState = { did: null, isAuthenticated: false, isLoading: false }
})

describe("/endorsements public view (signed out)", () => {
  it("renders the sign-in prompt instead of redirecting", async () => {
    const { default: EndorsementsPage } = await import("../endorsements/page")
    render(<EndorsementsPage />)

    expect(screen.getByText("Sign in to see your endorsements")).toBeTruthy()
    // No redirect was issued for the anonymous visitor.
    expect(replace).not.toHaveBeenCalled()
  })

  it("invokes openSignIn when the CTA is clicked", async () => {
    const { default: EndorsementsPage } = await import("../endorsements/page")
    render(<EndorsementsPage />)

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(openSignIn).toHaveBeenCalledTimes(1)
  })

  it("renders the real Endorsements UI when authenticated", async () => {
    authState = { did: "did:plc:me", isAuthenticated: true, isLoading: false }
    const { default: EndorsementsPage } = await import("../endorsements/page")
    render(<EndorsementsPage />)

    // The management UI (tabs) renders; no sign-in prompt.
    expect(screen.queryByText("Sign in to see your endorsements")).toBeNull()
    expect(screen.getByRole("tab", { name: "Given" })).toBeTruthy()
  })
})

describe("/groups public view (signed out)", () => {
  it("renders the sign-in prompt instead of redirecting", async () => {
    const { default: GroupsPage } = await import("../../app/groups/page")
    render(<GroupsPage />)

    expect(screen.getByText("Sign in to see your groups")).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it("invokes openSignIn when the CTA is clicked", async () => {
    const { default: GroupsPage } = await import("../../app/groups/page")
    render(<GroupsPage />)

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(openSignIn).toHaveBeenCalledTimes(1)
  })

  it("renders the real Groups UI when authenticated", async () => {
    authState = { did: "did:plc:me", isAuthenticated: true, isLoading: false }
    const { default: GroupsPage } = await import("../../app/groups/page")
    render(<GroupsPage />)

    expect(screen.queryByText("Sign in to see your groups")).toBeNull()
    expect(screen.getByRole("heading", { name: "Membership" })).toBeTruthy()
  })
})
