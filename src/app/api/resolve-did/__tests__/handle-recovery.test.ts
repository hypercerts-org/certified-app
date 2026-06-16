import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Tests for the handle->DID recovery chain in `resolveInputToDid`
 * (resolve-core.ts), the front-door fix for #184. When an account
 * migrates PDS/handle, its OLD handle no longer resolves live, so a
 * bookmarked `/{handle}/activity/{rkey}` URL can't be turned into a DID
 * and the detail page 404s. The chain adds two fallbacks after the live
 * appView lookup:
 *
 *   1. resolveHandleToDid (Bluesky appView)        — live, common case
 *   2. resolveHandleViaWellKnown (.well-known)     — custom domains
 *   3. fetchIndexerDidByHandle (the indexer)       — migrated handle
 *
 * The indexer step `search`es for the (stale, still-indexed) handle, then
 * CONFIRMS each candidate by exact-matching `actorProfile(did).handle` so a
 * fuzzy search hit can never resolve to the wrong account.
 *
 * resolveHandleToDid / resolveHandleViaWellKnown are mocked (we drive the
 * fallthrough); the indexer GraphQL endpoint is served by a mocked global
 * fetch, dispatched by the request's `operationName` (and, for the
 * verification query, by `variables.did`).
 */

const resolveHandleToDid = vi.fn(async (..._a: unknown[]): Promise<string | null> => null)
const resolveHandleViaWellKnown = vi.fn(
  async (..._a: unknown[]): Promise<string | null> => null,
)

vi.mock("@/lib/atproto/did", () => ({
  resolveHandle: vi.fn(async () => null),
  resolveHandleToDid: (...a: unknown[]) => resolveHandleToDid(...a),
  resolveHandleViaWellKnown: (...a: unknown[]) => resolveHandleViaWellKnown(...a),
  resolvePdsUrl: vi.fn(async () => null),
}))

const INDEXER_URL = "https://magic-indexer-prod.up.railway.app/graphql"
const MIGRATED_DID = "did:plc:btkxk3v7eotpivnmwcq3h3s2"
const OTHER_DID = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"
const STALE_HANDLE = "ecocertain.climateai.org"

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface IndexerBody {
  operationName?: string
  variables?: { did?: string; search?: string }
}

function parseBody(init: RequestInit | undefined): IndexerBody {
  try {
    return JSON.parse(String(init?.body ?? "{}")) as IndexerBody
  } catch {
    return {}
  }
}

/**
 * Wire the indexer mock from two maps:
 *  - searchEdges: search term -> candidate DIDs (the ResolveDidByHandle op)
 *  - handleByDid: did -> its (stale) indexed handle (the ResolveActorProfile op)
 */
function mockIndexer(
  searchEdges: Record<string, string[]>,
  handleByDid: Record<string, string | null>,
) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url) !== INDEXER_URL) {
      return Promise.resolve(new Response("", { status: 404 }))
    }
    const { operationName, variables } = parseBody(init)
    if (operationName === "ResolveDidByHandle") {
      const dids = searchEdges[variables?.search ?? ""] ?? []
      return Promise.resolve(
        jsonResponse({
          data: {
            appCertifiedActorProfile: {
              edges: dids.map((did) => ({ node: { did } })),
            },
          },
        }),
      )
    }
    if (operationName === "ResolveActorProfile") {
      const did = variables?.did ?? ""
      return Promise.resolve(
        jsonResponse({
          data: { actorProfile: { did, handle: handleByDid[did] ?? null } },
        }),
      )
    }
    return Promise.resolve(new Response("", { status: 404 }))
  })
}

function indexerWasCalled(): boolean {
  return mockFetch.mock.calls.some((c) => String(c[0]) === INDEXER_URL)
}

async function resolve(did: string, handle: string): Promise<string | null> {
  vi.resetModules()
  const { resolveInputToDid } = await import("../resolve-core")
  return resolveInputToDid(did, handle)
}

beforeEach(() => {
  resolveHandleToDid.mockReset().mockResolvedValue(null)
  resolveHandleViaWellKnown.mockReset().mockResolvedValue(null)
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  vi.stubEnv("INDEXER_URL", INDEXER_URL)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

describe("resolveInputToDid — handle->DID recovery (#184)", () => {
  it("recovers a migrated handle from the indexer when live resolution fails", async () => {
    mockIndexer(
      { [STALE_HANDLE]: [MIGRATED_DID] },
      { [MIGRATED_DID]: STALE_HANDLE },
    )
    const did = await resolve("", STALE_HANDLE)
    expect(did).toBe(MIGRATED_DID)
    expect(resolveHandleToDid).toHaveBeenCalled()
    expect(resolveHandleViaWellKnown).toHaveBeenCalled()
    expect(indexerWasCalled()).toBe(true)
  })

  it("matches the indexed handle case-insensitively", async () => {
    mockIndexer(
      { "Ecocertain.ClimateAI.org": [MIGRATED_DID] },
      { [MIGRATED_DID]: STALE_HANDLE },
    )
    const did = await resolve("", "Ecocertain.ClimateAI.org")
    expect(did).toBe(MIGRATED_DID)
  })

  it("abstains (null) when no candidate's handle exactly matches — a fuzzy hit is rejected", async () => {
    // search surfaces a candidate, but its indexed handle is a different
    // account (matched on display name, say) — must NOT resolve to it.
    mockIndexer(
      { [STALE_HANDLE]: [OTHER_DID] },
      { [OTHER_DID]: "someone-else.test" },
    )
    const did = await resolve("", STALE_HANDLE)
    expect(did).toBeNull()
    expect(indexerWasCalled()).toBe(true)
  })

  it("picks the exact-match candidate among several search results", async () => {
    mockIndexer(
      { [STALE_HANDLE]: [OTHER_DID, MIGRATED_DID] },
      { [OTHER_DID]: "nope.test", [MIGRATED_DID]: STALE_HANDLE },
    )
    const did = await resolve("", STALE_HANDLE)
    expect(did).toBe(MIGRATED_DID)
  })

  it("returns null when the indexer search finds nothing", async () => {
    mockIndexer({}, {})
    const did = await resolve("", "gone.example.com")
    expect(did).toBeNull()
  })

  it("uses the live appView result and never touches the indexer", async () => {
    resolveHandleToDid.mockResolvedValue(MIGRATED_DID)
    mockIndexer({ [STALE_HANDLE]: [OTHER_DID] }, { [OTHER_DID]: "x.test" })
    const did = await resolve("", STALE_HANDLE)
    expect(did).toBe(MIGRATED_DID)
    expect(resolveHandleViaWellKnown).not.toHaveBeenCalled()
    expect(indexerWasCalled()).toBe(false)
  })

  it("falls to .well-known before the indexer", async () => {
    resolveHandleViaWellKnown.mockResolvedValue(MIGRATED_DID)
    mockIndexer({ [STALE_HANDLE]: [OTHER_DID] }, { [OTHER_DID]: "x.test" })
    const did = await resolve("", STALE_HANDLE)
    expect(did).toBe(MIGRATED_DID)
    expect(indexerWasCalled()).toBe(false)
  })

  it("passes a valid DID through unchanged without resolving anything", async () => {
    const did = await resolve(MIGRATED_DID, "")
    expect(did).toBe(MIGRATED_DID)
    expect(resolveHandleToDid).not.toHaveBeenCalled()
    expect(indexerWasCalled()).toBe(false)
  })
})
