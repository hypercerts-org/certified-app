import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"

// --- Module mocks -----------------------------------------------------
// EndorsementsPage pulls in auth, navbar/navigation contexts, the
// given-endorsements hook, the own-response-states hook, and per-row
// author-info. None of those are under test here — stub them to inert
// defaults so the page mounts on the Received tab and we can assert
// whether a rejected endorsement row is rendered.
//
// The one mock that carries the assertion is `useReceivedEndorsements`:
// it mirrors the real hook's `includeRejected` contract (rejected
// awards are stripped unless the caller opts in). The page is the
// owner's own management inbox, so the fix is for the page to pass
// `{ includeRejected: true }`; before the fix it passes nothing and
// the rejected row is filtered out.

const DID = "did:plc:owner"

const REJECTED_ENDORSEMENT: ReceivedEndorsement = {
  uri: "at://did:plc:issuer/app.certified.badge.award/rejected1",
  cid: "bafyrejected",
  issuerDid: "did:plc:issuer",
  createdAt: "2025-01-01T00:00:00.000Z",
  note: "Rejected endorsement note",
  responseState: "rejected",
}

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: DID, isAuthenticated: true }),
}))

// Personal (non-delegated) session — the page renders its owner inbox.
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => undefined,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/endorsements",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=received"),
}))

vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => ({
    endorsements: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  }),
}))

// Mirror the real hook's `includeRejected` filter: rejected awards are
// only returned when the caller opts in. This is the exact behavior the
// fix exercises from the page's call site.
const receivedHook = vi.fn(
  (
    _profileDid: string | null,
    opts?: { includeRejected?: boolean },
  ) => {
    const all = [REJECTED_ENDORSEMENT]
    const endorsements = opts?.includeRejected
      ? all
      : all.filter((e) => e.responseState !== "rejected")
    return { endorsements, isLoading: false, error: null }
  },
)

vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: (
    profileDid: string | null,
    opts?: { includeRejected?: boolean },
  ) => receivedHook(profileDid, opts),
}))

vi.mock("@/hooks/use-own-response-states", () => ({
  useOwnResponseStates: () => ({
    resolve: () => ({ state: "rejected" as const }),
    responses: [],
    isLoading: false,
    invalidate: vi.fn(),
    refetch: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({
    info: { did: "did:plc:issuer", handle: "issuer.test", displayName: "Issuer Name", avatarUrl: null },
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/lib/atproto/badges", () => ({
  deleteEndorsementAward: vi.fn(async () => undefined),
}))

import EndorsementsPage from "../endorsements/page"

beforeEach(() => {
  cleanup()
  receivedHook.mockClear()
})

afterEach(() => {
  cleanup()
})

describe("EndorsementsPage Received tab — rejected endorsements", () => {
  it("requests rejected endorsements and renders the rejected row (owner inbox)", async () => {
    render(<EndorsementsPage />)

    // The owner's own inbox must opt into seeing rejected awards so the
    // user can review (and un-reject) them — §22.21 privacy is preserved
    // because this is the owner viewing their own inbox.
    await waitFor(() => {
      expect(receivedHook).toHaveBeenCalledWith(
        DID,
        expect.objectContaining({ includeRejected: true }),
      )
    })

    // And the rejected row actually renders.
    expect(await screen.findByText("Issuer Name")).toBeTruthy()
    expect(screen.getByText("Rejected endorsement note")).toBeTruthy()
  })
})
