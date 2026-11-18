import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

/**
 * The profile's trust line: the long form names two endorsers and how many
 * others; the phone's short form names one and "+N", so the count is never
 * cut off with the names. Endorsers' faces take the shape of their kind.
 */

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ did: null, isAuthenticated: false }) }))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ activeOrg: null }) }))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null, failed: false, retry: vi.fn() }),
}))
// "did:plc:org…" accounts are organizations; "did:plc:wait…" are still
// being read.
vi.mock("@/hooks/use-org-marker", () => ({
  useOrgMarker: (did: string) => ({
    isOrg: did.startsWith("did:plc:org"),
    marker: null,
    isLoading: did.startsWith("did:plc:wait"),
    answeredFor: did.startsWith("did:plc:wait") ? null : did,
    failed: false,
    refresh: vi.fn(),
  }),
}))

interface Endorsement {
  uri: string
  cid: string
  issuerDid: string
  createdAt: string
  issuer: { did: string; handle: string; displayName: string; description: null; avatarCid: string; pds: null }
}
let received: Endorsement[] = []
vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: () => ({ endorsements: received, isLoading: false, error: null, refetch: vi.fn() }),
}))
vi.mock("@/hooks/use-followers", () => ({
  useFollowers: () => ({ entries: [], count: 5, isLoading: false, error: null }),
}))
vi.mock("@/hooks/use-following", () => ({
  useFollowing: () => ({ subjects: new Set(), count: 0, isLoading: false, truncated: false }),
}))

import ProfileTrustLine from "../profile-trust-line"

function endorsement(issuerDid: string, name: string, day: number): Endorsement {
  return {
    uri: `at://${issuerDid}/award/${day}`,
    cid: "c",
    issuerDid,
    createdAt: `2026-05-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    issuer: { did: issuerDid, handle: `${day}.test`, displayName: name, description: null, avatarCid: "bafy", pds: null },
  }
}

beforeEach(() => {
  received = [
    endorsement("did:plc:org-maearth", "Ma Earth", 9),
    endorsement("did:plc:rosa", "Rosa Linden", 8),
    endorsement("did:plc:wait-bo", "Bo", 7),
    endorsement("did:plc:org-maearth", "Ma Earth", 1),
  ]
})

afterEach(() => {
  cleanup()
})

describe("ProfileTrustLine", () => {
  it("has a short form that keeps the count: one name and +N", () => {
    const { container } = render(<ProfileTrustLine did="did:plc:ada" basePath="/ada.test" />)
    const long = container.querySelector(".profile-trust__text--long")!
    const short = container.querySelector(".profile-trust__text--short")!
    // One account counts once, however many awards it gave.
    expect(long.textContent).toBe("Endorsed by Ma Earth, Rosa Linden and 1 other")
    expect(short.querySelector(".profile-trust__short-lead")!.textContent).toBe(
      "Endorsed by Ma Earth",
    )
    expect(short.querySelector(".profile-trust__more")!.textContent).toBe("+2 and 2 others")
  })

  it("draws each endorser's face in the shape of its kind", () => {
    const { container } = render(<ProfileTrustLine did="did:plc:ada" basePath="/ada.test" />)
    const faces = container.querySelectorAll(".profile-trust__face")
    expect(faces).toHaveLength(3)
    expect(faces[0].getAttribute("data-kind")).toBe("org")
    expect(faces[0].querySelector('[data-shape="square"]')).toBeTruthy()
    expect(faces[1].querySelector('[data-shape="circle"]')).toBeTruthy()
    // Not known yet: a neutral block, never a person's circle.
    expect(faces[2].getAttribute("data-kind")).toBe("unknown")
    expect(faces[2].querySelector("[data-shape]")).toBeNull()
  })
})
