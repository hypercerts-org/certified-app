import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { setOnUnauthorized } from "@/lib/auth/fetch"
import type { CollectionValue } from "@/lib/atproto/collection"

// risk-008: the saveWithSwap `read` callback must go through `authFetch`,
// not raw `fetch`, so a 401 on the conflict re-read of the session-bearing
// `/api/xrpc/.../getRecord` route fires the `onUnauthorized` interceptor.
//
// We drive the real edit-page save flow: putProjectRecord throws
// InvalidSwapError on the first write, which forces saveWithSwap to invoke
// the page's `read()`. We mock the global `fetch` to 401 that re-read and
// assert the registered onUnauthorized listener fires — which only happens
// on the authFetch path.

const DID = "did:plc:owner"
const RKEY = "proj1"

vi.mock("next/navigation", () => ({
  useParams: () => ({ did: DID, rkey: RKEY }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, did: DID }),
}))

vi.mock("@/hooks/use-managed-authors", () => ({
  // The viewer is the record owner (DID) — a personal record, so an empty
  // managed-identity map is enough for `isPersonalRecord` to grant edit.
  useManagedAuthors: () => ({
    authors: [DID],
    identities: [{ did: DID, kind: "personal", label: "You" }],
    byDid: new Map([[DID, { did: DID, kind: "personal", label: "You" }]]),
    isLoading: false,
  }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
}))

const SEEDED_VALUE = {
  title: "Seeded project title",
  $type: "org.hypercerts.collection",
  createdAt: "2024-01-01T00:00:00.000Z",
} as unknown as CollectionValue

vi.mock("@/hooks/use-project", () => ({
  useProject: () => ({
    project: {
      uri: `at://${DID}/org.hypercerts.collection/${RKEY}`,
      cid: "bafyOLD",
      did: DID,
      rkey: RKEY,
      value: SEEDED_VALUE,
    },
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/hooks/use-project-items", () => ({
  useProjectItems: () => ({ resolutions: [], isLoading: false }),
}))

// First write attempt 409s (InvalidSwap), which makes saveWithSwap re-read.
const putProjectRecord = vi.fn(async (..._args: unknown[]) => {
  throw new InvalidSwapError()
})
vi.mock("@/lib/atproto/project", () => ({
  putProjectRecord: (...args: unknown[]) => putProjectRecord(...args),
}))

import ProjectEditPage from "../page"

beforeEach(() => {
  cleanup()
  putProjectRecord.mockClear()
  setOnUnauthorized(null)
})

afterEach(() => {
  cleanup()
  setOnUnauthorized(null)
  vi.restoreAllMocks()
})

describe("project edit save — conflict re-read uses authFetch", () => {
  it("fires onUnauthorized when the getRecord conflict re-read 401s", async () => {
    const onUnauthorized = vi.fn()
    setOnUnauthorized(onUnauthorized)

    // Global fetch: 401 on the getRecord re-read (session-bearing /api/xrpc).
    // authFetch wraps this and is what triggers onUnauthorized; raw fetch
    // would swallow the 401 without notifying the interceptor.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("/api/xrpc/com/atproto/repo/getRecord")) {
        return new Response("Unauthorized", { status: 401 })
      }
      // Quick-pick own-certs listRecords and any other background fetch.
      return new Response(JSON.stringify({ records: [] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ProjectEditPage />)

    // The Save button comes from the sticky EditBanner. It's enabled
    // because the seeded title is >= 5 graphemes and a mountSnapshot is set.
    const saveBtn = await screen.findByRole("button", { name: "Save" })

    fireEvent.click(saveBtn)

    // After the write 409s, saveWithSwap calls read() → authFetch(getRecord)
    // → 401 → onUnauthorized.
    await waitFor(() => {
      expect(putProjectRecord).toHaveBeenCalled()
      expect(onUnauthorized).toHaveBeenCalled()
    })
  })
})
