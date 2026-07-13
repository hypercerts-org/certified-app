import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchNetworkCountsServer } from "../network-counts-server"

/**
 * Fail-soft contract for the server-side landing-page counts helper:
 * it must NEVER throw and never hang the ISR render — any per-query
 * failure (HTTP !ok, GraphQL errors, timeout/abort, bad shape)
 * degrades that field to null, and a missing upstream URL yields
 * all-null without touching the network.
 */

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

const ALL_NULL = {
  users: null,
  organizations: null,
  achievements: null,
  projects: null,
  endorsements: null,
}

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  vi.stubEnv("INDEXER_URL", "https://indexer.test/graphql")
  vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "")
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

/** Respond per-operation so parallel queries can diverge. */
function respondByOperation(
  handler: (operationName: string) => Response | Promise<Response>,
): void {
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { operationName: string }
    return handler(body.operationName)
  })
}

function okResponse(root: string, totalCount: number): Response {
  return new Response(
    JSON.stringify({ data: { [root]: { totalCount } } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

const ROOTS: Record<string, string> = {
  ProfileCount: "appCertifiedActorProfile",
  OrganizationCount: "appCertifiedActorOrganization",
  ActivityCount: "orgHypercertsClaimActivity",
  ProjectCount: "orgHypercertsCollection",
  AwardCount: "appCertifiedBadgeAward",
}

const TOTALS: Record<string, number> = {
  ProfileCount: 101,
  OrganizationCount: 22,
  ActivityCount: 333,
  ProjectCount: 44,
  AwardCount: 555,
}

describe("fetchNetworkCountsServer", () => {
  it("maps the five upstream totals onto the NetworkCounts keys", async () => {
    respondByOperation((op) => okResponse(ROOTS[op], TOTALS[op]))

    const counts = await fetchNetworkCountsServer()

    expect(counts).toEqual({
      users: 101,
      organizations: 22,
      achievements: 333,
      projects: 44,
      endorsements: 555,
    })
    expect(mockFetch).toHaveBeenCalledTimes(5)
    // Direct-to-upstream: the RSC helper must not go through the
    // same-origin /api/indexer proxy.
    expect(mockFetch.mock.calls[0][0]).toBe("https://indexer.test/graphql")
    const body = JSON.parse(String(mockFetch.mock.calls[0][1].body))
    expect(typeof body.query).toBe("string")
    expect(body.query).toContain("totalCount")
  })

  it("returns all-null on upstream HTTP 500 without throwing", async () => {
    mockFetch.mockResolvedValue(new Response("upstream down", { status: 500 }))

    await expect(fetchNetworkCountsServer()).resolves.toEqual(ALL_NULL)
  })

  it("returns all-null when fetch rejects (timeout / abort)", async () => {
    mockFetch.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError"),
    )

    await expect(fetchNetworkCountsServer()).resolves.toEqual(ALL_NULL)
  })

  it("returns all-null on a GraphQL errors payload", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ data: null, errors: [{ message: "boom" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    await expect(fetchNetworkCountsServer()).resolves.toEqual(ALL_NULL)
  })

  it("nulls only the failing field when one query fails", async () => {
    respondByOperation((op) =>
      op === "ProjectCount"
        ? new Response("flaky", { status: 502 })
        : okResponse(ROOTS[op], TOTALS[op]),
    )

    const counts = await fetchNetworkCountsServer()

    expect(counts.projects).toBeNull()
    expect(counts.users).toBe(101)
    expect(counts.organizations).toBe(22)
    expect(counts.achievements).toBe(333)
    expect(counts.endorsements).toBe(555)
  })

  it("nulls a field whose totalCount is missing or non-numeric", async () => {
    respondByOperation((op) =>
      op === "AwardCount"
        ? new Response(
            JSON.stringify({ data: { [ROOTS[op]]: { totalCount: null } } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        : okResponse(ROOTS[op], TOTALS[op]),
    )

    const counts = await fetchNetworkCountsServer()

    expect(counts.endorsements).toBeNull()
    expect(counts.users).toBe(101)
  })

  it("returns all-null without fetching when no upstream URL is set", async () => {
    vi.stubEnv("INDEXER_URL", "")
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "")

    await expect(fetchNetworkCountsServer()).resolves.toEqual(ALL_NULL)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("falls back to NEXT_PUBLIC_INDEXER_URL when INDEXER_URL is unset", async () => {
    vi.stubEnv("INDEXER_URL", "")
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "https://public.test/graphql")
    respondByOperation((op) => okResponse(ROOTS[op], TOTALS[op]))

    const counts = await fetchNetworkCountsServer()

    expect(counts.users).toBe(101)
    expect(mockFetch.mock.calls[0][0]).toBe("https://public.test/graphql")
  })
})
