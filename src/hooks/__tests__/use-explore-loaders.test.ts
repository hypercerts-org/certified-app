import { describe, it, expect, vi, beforeEach } from "vitest"

// Pins the LoadArgs.pageSize contract: the server-paginated branches
// (default accounts / projects / certs listings + funding) thread the
// caller's page size into `first:`, while the client-side-filtered
// follows branch keeps its fixed 100-actor window — trimming that one
// would empty the client-side intersect (All-view skeptic carve-out).

vi.mock("@/lib/atproto/indexer", () => ({
  fetchEndorsementClosure: vi.fn(),
  fetchFundingReceipts: vi.fn(async () => ({
    records: [],
    endCursor: null,
    hasMore: false,
  })),
  fetchIndexerActivities: vi.fn(async () => ({
    records: [],
    dids: new Map(),
    endCursor: null,
    hasMore: false,
  })),
  fetchIndexerActivitiesByUris: vi.fn(),
  fetchProjects: vi.fn(async () => ({
    records: [],
    endCursor: null,
    hasMore: false,
  })),
  fetchUserIndexerActivities: vi.fn(),
  EndorsementClosureError: class EndorsementClosureError extends Error {},
}))

vi.mock("@/lib/atproto/workspace", () => ({
  fetchNetworkActors: vi.fn(async () => ({
    actors: [],
    endCursor: null,
    hasMore: false,
  })),
  fetchNetworkActorsByDids: vi.fn(),
  fetchDidsByKindInSet: vi.fn(),
}))

vi.mock("@/lib/atproto/badges", () => ({
  fetchGivenEndorsementDids: vi.fn(),
}))

vi.mock("@/lib/utils/recently-viewed", () => ({
  getRecentlyViewed: vi.fn(() => []),
  removeRecentlyViewed: vi.fn(),
}))

vi.mock("@/lib/atproto/records-by-uri", () => ({
  fetchActivitiesByUris: vi.fn(),
  fetchProjectsByUris: vi.fn(),
}))

vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn(),
}))

import { loadPage, type LoadArgs } from "@/hooks/use-explore-loaders"
import {
  fetchFundingReceipts,
  fetchIndexerActivities,
  fetchProjects,
} from "@/lib/atproto/indexer"
import { fetchNetworkActors } from "@/lib/atproto/workspace"

function args(overrides: Partial<LoadArgs>): LoadArgs {
  return {
    kind: "activities",
    filter: "all",
    sub: "all",
    search: "",
    viewerDid: null,
    followedDids: new Set<string>(),
    myGroupDids: new Set<string>(),
    myGroups: [],
    managedAuthorDids: [],
    cursor: null,
    signal: null,
    pageSize: 10,
    degree: 1,
    noEndorsementRings: false,
    excludeCertLabels: null,
    includeCertLabels: null,
    excludeOrgLabels: null,
    includeOrgLabels: null,
    confirmedBy: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loadPage pageSize threading", () => {
  it("threads pageSize into the default activities listing", async () => {
    await loadPage(args({ kind: "activities" }))
    expect(fetchIndexerActivities).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchIndexerActivities).mock.calls[0][0]).toMatchObject({
      first: 10,
    })
  })

  it("threads pageSize into the default projects listing", async () => {
    await loadPage(args({ kind: "projects" }))
    expect(fetchProjects).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchProjects).mock.calls[0][0]).toMatchObject({
      first: 10,
    })
  })

  it("threads pageSize into the default accounts listing", async () => {
    await loadPage(args({ kind: "accounts" }))
    expect(fetchNetworkActors).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchNetworkActors).mock.calls[0][0]).toMatchObject({
      first: 10,
    })
  })

  it("threads pageSize into the funding listing", async () => {
    await loadPage(args({ kind: "funding" }))
    expect(fetchFundingReceipts).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchFundingReceipts).mock.calls[0][0]).toMatchObject({
      first: 10,
    })
  })

  it("keeps the fixed 100-actor window on the client-filtered follows branch", async () => {
    await loadPage(
      args({
        kind: "accounts",
        filter: "follows",
        viewerDid: "did:plc:viewer",
        followedDids: new Set(["did:plc:a"]),
      }),
    )
    expect(fetchNetworkActors).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchNetworkActors).mock.calls[0][0]).toMatchObject({
      first: 100,
    })
  })
})
