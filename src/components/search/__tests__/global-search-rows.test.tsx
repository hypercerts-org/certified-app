import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react"

// The search's rows: an activity or project names its owner as Explore
// does ("by <name>"), not by handle, and a search that finds nothing says
// so in one muted line above the way on ("Search Explore for …").

const data = vi.hoisted(() => ({
  certs: [] as { uri: string; value: { title: string } }[],
  projects: [] as { uri: string; value: { title: string } }[],
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock("@/lib/atproto/indexer", () => ({
  fetchIndexerActivities: async () => ({
    records: data.certs,
    dids: new Map(data.certs.map((c) => [c.uri, c.uri.split("/")[2]])),
  }),
}))

vi.mock("@/lib/atproto/indexer-collections", () => ({
  fetchProjects: async () => ({ records: data.projects }),
}))

vi.mock("@/lib/atproto/workspace", () => ({
  fetchNetworkActors: async () => ({ actors: [] }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    info: did
      ? { displayName: "Riverbank Trust", handle: "riverbank.certified.app", avatarUrl: null }
      : null,
  }),
}))

import GlobalSearch from "../global-search"

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ actors: [] }) })),
  )
  data.certs = []
  data.projects = []
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function search(q: string) {
  render(<GlobalSearch placeholder="Search" />)
  fireEvent.change(screen.getByRole("combobox", { name: "Search" }), {
    target: { value: q },
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  return screen.getByRole("listbox")
}

describe("GlobalSearch rows", () => {
  it("names an activity's and a project's owner, not their handle", async () => {
    data.certs = [
      { uri: "at://did:plc:river/org.hypercerts.claim.activity/1", value: { title: "Mangrove nursery" } },
    ]
    data.projects = [
      { uri: "at://did:plc:river/org.hypercerts.claim.collection/2", value: { title: "Mangrove coast" } },
    ]
    const list = await search("mangrove")
    expect(within(list).getAllByText("by Riverbank Trust")).toHaveLength(2)
    expect(within(list).queryByText("@riverbank.certified.app")).toBeNull()
    expect(within(list).queryByText("No activities, projects or accounts match.")).toBeNull()
  })

  it("says nothing matched, above the Explore row", async () => {
    const list = await search("zzzz")
    const line = within(list).getByText("No activities, projects or accounts match.")
    const explore = within(list).getByRole("option", { name: /Search Explore for/ })
    expect(line.compareDocumentPosition(explore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Not an option: the arrow keys walk past it.
    expect(within(list).getAllByRole("option")).toHaveLength(1)
  })
})
