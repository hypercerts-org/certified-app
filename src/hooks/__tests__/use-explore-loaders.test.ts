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
  fetchIndexerProjectsByUris: vi.fn(),
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
  fetchIndexerProjectsByUris,
  fetchProjects,
} from "@/lib/atproto/indexer"
import { fetchNetworkActors } from "@/lib/atproto/workspace"
import { fetchProjectsByUris } from "@/lib/atproto/records-by-uri"
import { MA_EARTH_FILTER } from "@/lib/atproto/featured"
import { authFetch } from "@/lib/auth/fetch"
import type { CollectionRecord } from "@/lib/atproto/collection"

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

// Pins the Ma Earth featured Projects contract: the curated URIs go
// through the indexer batch (`fetchIndexerProjectsByUris`) first, with
// the curator's item order restored, and the per-URI PDS path
// (`fetchProjectsByUris`) engages ONLY when the batch fails — HTTP /
// GraphQL failure (ok: false), an all-empty result for a non-empty
// curated set, or a rejected call. The deployed indexer may not
// support `uri: { in }` on `orgHypercertsCollection` yet, so the PDS
// fallback is what keeps this branch shippable either way.
describe("loadPage Ma Earth projects batch → PDS fallback", () => {
  const P1 = "at://did:plc:curated/org.hypercerts.collection/proj-1"
  const P2 = "at://did:plc:curated/org.hypercerts.collection/proj-2"

  function rec(uri: string): CollectionRecord {
    return { uri, cid: `cid-${uri.slice(-1)}`, value: { type: "project" } }
  }

  beforeEach(() => {
    // Featured source collections resolve via authFetch getRecord; all
    // three Ma Earth project collections return the same two items
    // (deduped to [P1, P2]). Cached module-wide after the first test —
    // re-mocked here so each test also passes in isolation.
    vi.mocked(authFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        value: {
          items: [
            { itemIdentifier: { uri: P1, cid: "c1" } },
            { itemIdentifier: { uri: P2, cid: "c2" } },
          ],
        },
      }),
    } as unknown as Response)
  })

  it("serves the batch result in curator order without touching the PDS path", async () => {
    // Indexer returns indexed order (P2 first) — the loader re-sorts
    // to the curated item order the PDS path preserves implicitly.
    vi.mocked(fetchIndexerProjectsByUris).mockResolvedValue({
      ok: true,
      records: [rec(P2), rec(P1)],
    })

    const page = await loadPage(
      args({ kind: "projects", filter: MA_EARTH_FILTER }),
    )

    expect(fetchIndexerProjectsByUris).toHaveBeenCalledWith(
      [P1, P2],
      undefined,
    )
    expect(fetchProjectsByUris).not.toHaveBeenCalled()
    expect(page.projects.map((p) => p.uri)).toEqual([P1, P2])
  })

  it("falls back to the per-URI PDS path when the batch reports failure", async () => {
    vi.mocked(fetchIndexerProjectsByUris).mockResolvedValue({
      ok: false,
      records: [],
    })
    vi.mocked(fetchProjectsByUris).mockResolvedValue({
      records: [rec(P1), rec(P2)],
      missing: [],
    })

    const page = await loadPage(
      args({ kind: "projects", filter: MA_EARTH_FILTER }),
    )

    expect(fetchProjectsByUris).toHaveBeenCalledWith([P1, P2], undefined)
    expect(page.projects.map((p) => p.uri)).toEqual([P1, P2])
  })

  it("falls back when the batch resolves empty for a non-empty curated set", async () => {
    vi.mocked(fetchIndexerProjectsByUris).mockResolvedValue({
      ok: true,
      records: [],
    })
    vi.mocked(fetchProjectsByUris).mockResolvedValue({
      records: [rec(P1)],
      missing: [P2],
    })

    const page = await loadPage(
      args({ kind: "projects", filter: MA_EARTH_FILTER }),
    )

    expect(fetchProjectsByUris).toHaveBeenCalledTimes(1)
    expect(page.projects.map((p) => p.uri)).toEqual([P1])
  })

  it("falls back when the batch call rejects", async () => {
    vi.mocked(fetchIndexerProjectsByUris).mockRejectedValue(
      new Error("indexer unreachable"),
    )
    vi.mocked(fetchProjectsByUris).mockResolvedValue({
      records: [rec(P2)],
      missing: [P1],
    })

    const page = await loadPage(
      args({ kind: "projects", filter: MA_EARTH_FILTER }),
    )

    expect(fetchProjectsByUris).toHaveBeenCalledWith([P1, P2], undefined)
    expect(page.projects.map((p) => p.uri)).toEqual([P2])
  })
})
