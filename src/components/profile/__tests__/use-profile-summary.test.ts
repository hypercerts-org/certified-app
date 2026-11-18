import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

/**
 * The profile's counts: the Endorsements tab counts the accounts that
 * endorsed this one, each once (as the trust line does), not awards and
 * not the endorsements it gave; the lists given and followed carry their
 * own load state, so a failed one isn't taken for an empty one.
 */

let received: { endorsements: { issuerDid: string }[]; isLoading: boolean; error: string | null }
let given: { endorsements: unknown[]; isLoading: boolean; error: string | null }
let following: { count: number; isLoading: boolean; error: string | null }

vi.mock("@/hooks/use-user-indexer-activities", () => ({
  useUserIndexerActivities: () => ({
    created: [],
    contributed: [],
    dids: new Map(),
    isLoading: false,
    hasMore: false,
    error: null,
  }),
}))
vi.mock("@/hooks/use-user-activity-count", () => ({ useUserActivityCount: () => 0 }))
vi.mock("@/hooks/use-user-projects", () => ({
  useUserProjects: () => ({ projects: [], isLoading: false, error: null, truncated: false }),
}))
vi.mock("@/hooks/use-received-endorsements", () => ({ useReceivedEndorsements: () => received }))
vi.mock("@/hooks/use-endorsements", () => ({ useGivenEndorsements: () => given }))
vi.mock("@/hooks/use-followers", () => ({ useFollowers: () => ({ count: 0, error: null }) }))
vi.mock("@/hooks/use-following", () => ({ useFollowing: () => following }))
vi.mock("@/hooks/use-typed-lists", () => ({
  useTypedLists: () => ({ lists: [], isLoading: false, error: null }),
}))

import { useProfileSummary } from "../use-profile-summary"

beforeEach(() => {
  received = { endorsements: [], isLoading: false, error: null }
  given = { endorsements: [], isLoading: false, error: null }
  following = { count: 0, isLoading: false, error: null }
})

describe("useProfileSummary counts", () => {
  it("counts the accounts that endorsed this one, each once, not the ones it endorsed", () => {
    received.endorsements = [
      { issuerDid: "did:plc:a" },
      { issuerDid: "did:plc:a" },
      { issuerDid: "did:plc:b" },
    ]
    given.endorsements = Array.from({ length: 148 }, () => ({}))
    const { result } = renderHook(() => useProfileSummary("did:plc:me"))
    expect(result.current.counts.endorsements.value).toBe(2)
    expect(result.current.counts.endorsementsGiven.value).toBe(148)
  })

  it("marks a failed list as failed, not as zero", () => {
    given = { ...given, error: "Indexer query failed: 429" }
    following = { ...following, error: "Failed to load follows" }
    const { result } = renderHook(() => useProfileSummary("did:plc:me"))
    expect(result.current.counts.endorsementsGiven.failed).toBe(true)
    expect(result.current.counts.following.failed).toBe(true)
  })
})
