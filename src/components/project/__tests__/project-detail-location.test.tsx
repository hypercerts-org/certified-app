import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, waitFor } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// ProjectDetail pulls in auth/org contexts, next/navigation, and the
// item-resolution hook. None of those are under test here — stub them
// to inert defaults so the component mounts read-only (not owner, not
// editing) and we can assert on the Location meta row.

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: null, isAuthenticated: false }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null, groups: [], switchOrg: () => {} }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/project/did:plc:abc/proj1",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/hooks/use-project-items", () => ({
  useProjectItems: () => ({ resolutions: [], isLoading: false }),
}))

vi.mock("@/hooks/use-record-funding", () => ({
  useRecordFunding: () => ({
    receipts: [],
    isLoading: false,
    error: null,
    complete: true,
    refetch: () => {},
  }),
}))

// The map itself is Leaflet (client-only); the names under it are what
// this test reads.
vi.mock("@/components/map/map-dynamic", () => ({ default: () => null }))

// The location resolution mirrors the edit page: parse the strongRef,
// getRecord via authFetch, then splitLocationName(value.name). Control
// the getRecord response per test.
const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}))

import ProjectDetail from "../project-detail"
import type { CollectionValue } from "@/lib/atproto/collection"

const DID = "did:plc:abc"
const LOCATION_URI = "at://did:plc:loc/app.certified.location/loc1"

beforeEach(() => {
  cleanup()
  authFetch.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("ProjectDetail location strongRef", () => {
  it("resolves a location strongRef to its name and never renders [object Object]", async () => {
    authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: { name: "Berlin" } }),
    })

    const value = {
      title: "My project",
      location: { uri: LOCATION_URI, cid: "bafyloc" },
    } as unknown as CollectionValue

    render(
      <ProjectDetail
        did={DID}
        rkey="proj1"
        value={value}
        cid="bafycid"
        handle={null}
      />,
    )

    // The resolved place name shows in the byline and the Location card.
    expect((await screen.findAllByText("Berlin")).length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Location" })).toBeTruthy()

    // The object shape must never leak as a stringified label.
    await waitFor(() => {
      expect(document.body.textContent).not.toContain("[object Object]")
    })
  })
})
